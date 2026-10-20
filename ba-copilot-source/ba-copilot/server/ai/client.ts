// AI Orchestrator: gọi Claude API bằng tool use (bắt buộc trả JSON theo schema),
// validate kết quả, tự sửa tối đa 1 lần, và ghi log mọi lần gọi (PromptRun).

import { countClaudeRunsToday, logRun } from "../repo.ts";

export interface AIConfig {
  provider: "claude" | "mock";
  model: string;
  apiKey: string;
  /** ANTHROPIC_AUTH_TOKEN (cổng trung gian dùng Bearer), dùng khi không có API key */
  authToken: string;
  baseUrl: string;
}

export function aiConfig(): AIConfig {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim() ?? "";
  const forced = process.env.AI_MODE?.trim().toLowerCase();
  const authToken = process.env.ANTHROPIC_AUTH_TOKEN?.trim() ?? "";
  const provider = forced === "mock" || (!apiKey && !authToken) ? "mock" : "claude";
  return {
    provider,
    model: process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-5",
    apiKey,
    authToken,
    baseUrl: (process.env.ANTHROPIC_BASE_URL?.trim() || "https://api.anthropic.com").replace(/\/+$/, "").replace(/\/v1$/, ""),
  };
}

export interface ToolSpec {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface RunAIOptions<T> {
  type: string; // generate_screen, edit_screen, ...
  moduleId: string | null;
  system: string;
  prompt: string;
  tool: ToolSpec;
  maxTokens?: number;
  /** Chuyển input thô của tool thành kết quả; ném lỗi (hoặc trả mảng lỗi) nếu không hợp lệ. */
  parse: (raw: unknown) => { value?: T; errors?: string[] };
  /** Kết quả khi chạy chế độ mock (không có API key). */
  mock: () => T;
}

export class AIError extends Error {
  constructor(message: string, public details?: string[]) {
    super(message);
  }
}

interface ClaudeMessage {
  role: "user" | "assistant";
  content: unknown;
}

export async function runAI<T>(opts: RunAIOptions<T>): Promise<T> {
  const cfg = aiConfig();
  const started = Date.now();
  if (cfg.provider === "mock") {
    const value = opts.mock();
    logRun({
      moduleId: opts.moduleId,
      type: opts.type,
      provider: "mock",
      model: "rule-based",
      input: opts.prompt.slice(0, 20000),
      output: JSON.stringify(value).slice(0, 50000),
      ok: true,
      error: "",
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: Date.now() - started,
    });
    return value;
  }

  // Chặn chi phí ngoài ý muốn khi deploy công khai
  const limit = Number(process.env.MAX_AI_CALLS_PER_DAY ?? 0);
  if (limit > 0 && countClaudeRunsToday() >= limit) {
    throw new AIError(`Đã đạt giới hạn ${limit} lượt gọi AI trong ngày (MAX_AI_CALLS_PER_DAY). Thử lại vào ngày mai hoặc tăng giới hạn.`);
  }
  const messages: ClaudeMessage[] = [{ role: "user", content: opts.prompt }];
  let inTok = 0;
  let outTok = 0;
  let lastErrors: string[] = [];
  let lastRaw: unknown = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${cfg.baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(cfg.apiKey ? { "x-api-key": cfg.apiKey } : { authorization: `Bearer ${cfg.authToken}` }),
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: cfg.model,
          max_tokens: opts.maxTokens ?? 8000,
          system: opts.system,
          messages,
          tools: [opts.tool],
          tool_choice: { type: "tool", name: opts.tool.name },
        }),
      });
    } catch (e) {
      return fail(`Không kết nối được Claude API: ${(e as Error).message}`);
    }
    const body = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) {
      return fail(`Claude API lỗi ${res.status}: ${body?.error?.message ?? JSON.stringify(body).slice(0, 300)}`);
    }
    inTok += body.usage?.input_tokens ?? 0;
    outTok += body.usage?.output_tokens ?? 0;
    const block = (body.content ?? []).find((c: any) => c.type === "tool_use");
    if (!block) {
      lastErrors = ["Model không gọi tool"];
      messages.push({ role: "assistant", content: body.content ?? [] });
      messages.push({ role: "user", content: `Hãy gọi tool ${opts.tool.name} để trả kết quả.` });
      continue;
    }
    lastRaw = block.input;
    let parsed: { value?: T; errors?: string[] };
    try {
      parsed = opts.parse(block.input);
    } catch (e) {
      parsed = { errors: [(e as Error).message] };
    }
    if (parsed.value !== undefined && !(parsed.errors && parsed.errors.length)) {
      logRun({
        moduleId: opts.moduleId,
        type: opts.type,
        provider: "claude",
        model: cfg.model,
        input: opts.prompt.slice(0, 20000),
        output: JSON.stringify(block.input).slice(0, 50000),
        ok: true,
        error: attempt ? `tự sửa sau lỗi: ${lastErrors.join("; ")}` : "",
        inputTokens: inTok,
        outputTokens: outTok,
        latencyMs: Date.now() - started,
      });
      return parsed.value;
    }
    lastErrors = parsed.errors ?? ["Kết quả không hợp lệ"];
    messages.push({ role: "assistant", content: body.content });
    messages.push({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: block.id,
          is_error: true,
          content: `Kết quả chưa hợp lệ, hãy gọi lại tool với bản đã sửa. Lỗi:\n- ${lastErrors.slice(0, 15).join("\n- ")}`,
        },
      ],
    });
  }
  return fail(`AI trả kết quả không hợp lệ sau 2 lần: ${lastErrors.slice(0, 5).join("; ")}`);

  function fail(msg: string): never {
    logRun({
      moduleId: opts.moduleId,
      type: opts.type,
      provider: "claude",
      model: cfg.model,
      input: opts.prompt.slice(0, 20000),
      output: lastRaw ? JSON.stringify(lastRaw).slice(0, 50000) : "",
      ok: false,
      error: msg,
      inputTokens: inTok,
      outputTokens: outTok,
      latencyMs: Date.now() - started,
    });
    throw new AIError(msg, lastErrors);
  }
}
