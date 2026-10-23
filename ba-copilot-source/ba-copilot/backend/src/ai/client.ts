// AI Orchestrator: gọi Claude API bằng tool use (bắt buộc trả JSON theo schema),
// validate kết quả, tự sửa tối đa 1 lần, và ghi log mọi lần gọi (PromptRun).

import { countClaudeRunsToday, logRun } from "../repo.ts";

export interface AIConfig {
  provider: "claude" | "mock";
  model: string;
  apiKey: string;
  /** Khoá kiểu Bearer (ANTHROPIC_AUTH_TOKEN), dùng khi đi qua cổng trung gian thay cho API key. */
  authToken: string;
  baseUrl: string;
}

export function aiConfig(): AIConfig {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim() ?? "";
  const authToken = process.env.ANTHROPIC_AUTH_TOKEN?.trim() ?? "";
  const forced = process.env.AI_MODE?.trim().toLowerCase();
  const provider = forced === "mock" || (!apiKey && !authToken) ? "mock" : "claude";
  return {
    provider,
    model: process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-5",
    apiKey,
    authToken,
    // bỏ "/" và "/v1" ở cuối: đường dẫn gọi đã có sẵn /v1/messages
    baseUrl: (process.env.ANTHROPIC_BASE_URL?.trim() || "https://api.anthropic.com").replace(/\/+$/, "").replace(/\/v1$/, ""),
  };
}

/** Header xác thực: API key → x-api-key, auth token → Authorization: Bearer (cùng quy ước với SDK Anthropic). */
function authHeaders(cfg: AIConfig): Record<string, string> {
  const h: Record<string, string> = {};
  if (cfg.apiKey) h["x-api-key"] = cfg.apiKey;
  if (cfg.authToken) h.authorization = `Bearer ${cfg.authToken}`;
  return h;
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
    throw new AIError(`The daily limit of ${limit} AI calls has been reached (MAX_AI_CALLS_PER_DAY). Try again tomorrow or raise the limit.`);
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
          ...authHeaders(cfg),
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
      return fail(`Could not connect to the Claude API: ${(e as Error).message}`);
    }
    const body = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) {
      return fail(`Claude API error ${res.status}: ${body?.error?.message ?? JSON.stringify(body).slice(0, 300)}`);
    }
    inTok += body.usage?.input_tokens ?? 0;
    outTok += body.usage?.output_tokens ?? 0;
    const block = (body.content ?? []).find((c: any) => c.type === "tool_use");
    if (!block) {
      lastErrors = ["The model did not call the tool"];
      messages.push({ role: "assistant", content: body.content ?? [] });
      messages.push({ role: "user", content: `Call the ${opts.tool.name} tool to return the result.` });
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
        error: attempt ? `self-corrected after errors: ${lastErrors.join("; ")}` : "",
        inputTokens: inTok,
        outputTokens: outTok,
        latencyMs: Date.now() - started,
      });
      return parsed.value;
    }
    lastErrors = parsed.errors ?? ["Invalid result"];
    messages.push({ role: "assistant", content: body.content });
    messages.push({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: block.id,
          is_error: true,
          content: `The result is invalid; call the tool again with a corrected version. Errors:\n- ${lastErrors.slice(0, 15).join("\n- ")}`,
        },
      ],
    });
  }
  return fail(`The AI returned an invalid result after 2 attempts: ${lastErrors.slice(0, 5).join("; ")}`);

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
