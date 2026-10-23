// GitHub của dự án (kế hoạch đợt 5, quyết định 10, 13, 14, 16; mục 3 "C8"). Chủ sở hữu: C8.
//
// Một luồng duy nhất: BA Lead bấm Duyệt → commit đúng các tệp của sản phẩm (server/gitExport.ts) lên MỘT nhánh
// của repo dự án (mặc định "main"). "Xong" không đụng GitHub. Không có Pull.
// Gọi GitHub REST API bằng fetch (Git Data API): ref nhánh → blob → tree (trên tree hiện tại) → commit → cập nhật ref.
// Nhánh chưa có → tạo từ nhánh mặc định của repo. Repo rỗng → tạo commit khởi tạo (README.md) bằng Contents API trước.
//
// Token: một token của dự án (`project_git.token`), thiếu thì dùng biến môi trường GITHUB_TOKEN.
// Token KHÔNG BAO GIỜ trả về client, không ghi log, không đưa vào thông báo lỗi.
// Khi nạp tệp này, hàm đẩy thật được đăng ký vào server/events.ts (registerApprovedPusher) để C7 gọi lúc Duyệt.

import { randomUUID } from "node:crypto";
import { getDb } from "./db.ts";
import { registerApprovedPusher } from "./events.ts";
import { HttpError } from "./http.ts";
import { buildExport, type ExportFile } from "./gitExport.ts";
import type { ArtifactRef, GitCommit, GitPush, GitPushOutcome, GitTestResult, ProjectGit } from "../../shared/types.ts";

// ---------------------------------------------------------------- fetch thay được (test)

export type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{
  status: number;
  ok: boolean;
  headers: { get(name: string): string | null };
  json(): Promise<any>;
  text(): Promise<string>;
}>;

let fetchImpl: FetchLike | null = null;
/** Thay fetch (chỉ dùng trong test). null = dùng fetch thật của Node. */
export function setGitHubFetch(fn: FetchLike | null): void {
  fetchImpl = fn;
}
const doFetch: FetchLike = (url, init) => (fetchImpl ?? (globalThis.fetch as unknown as FetchLike))(url, init);

const API = () => (process.env.GITHUB_API_URL || "https://api.github.com").replace(/\/+$/, "");

// ---------------------------------------------------------------- lỗi tiếng Việt

/**
 * Lỗi GitHub đã dịch sang tiếng Việt. Là HttpError 502 nên nếu lan ra API (vd C7 không bắt khi Duyệt) client nhận
 * đúng câu thông báo, không bị coi là lỗi máy chủ 500. `githubStatus`: mã HTTP GitHub trả (0 = lỗi mạng).
 */
export class GitHubError extends HttpError {
  constructor(
    message: string,
    public githubStatus: number,
  ) {
    super(message, 502);
    this.name = "GitHubError";
  }
}

/** Dịch lỗi GitHub thành câu tiếng Việt dễ hiểu. Không bao giờ chứa token. */
export function translateError(status: number, ghMessage: string, repoName: string, rateLimited = false): string {
  const msg = (ghMessage || "").toLowerCase();
  if (status === 401) return "The GitHub token is invalid or has expired – the BA Lead must update it in GitHub Settings.";
  if (status === 403 && (rateLimited || msg.includes("rate limit"))) return "GitHub is temporarily rate-limiting requests – try again in a few minutes.";
  if (status === 403 || (status === 404 && msg.includes("resource not accessible")))
    return `The token cannot write to repository ${repoName} – it needs the "Contents: Read and write" permission (or the "repo" scope).`;
  if (status === 404) return `Repository ${repoName} not found – check the repository link, or the token has not been granted access to it.`;
  if (status === 409) return `Repository ${repoName} is empty or the branch has a conflict – try again.`;
  if (status === 422) return `GitHub rejected the submitted data${ghMessage ? ` (${ghMessage})` : ""}.`;
  if (status >= 500) return `GitHub is having problems (code ${status}) – try again later.`;
  return `GitHub returned an error (code ${status})${ghMessage ? `: ${ghMessage}` : ""}.`;
}

const NETWORK_ERROR = "Could not connect to GitHub – check the server's network connection and try again.";

// ---------------------------------------------------------------- repo

export interface RepoId {
  owner: string;
  name: string;
}

/** Nhận `https://github.com/owner/name(.git)`, `github.com/owner/name`, `git@github.com:owner/name.git` hoặc `owner/name`. */
export function parseRepo(input: string): RepoId | null {
  let s = (input ?? "").trim();
  if (!s) return null;
  s = s.replace(/^git@github\.com:/i, "").replace(/^(https?:\/\/)?(www\.)?github\.com\//i, "");
  s = s.replace(/[?#].*$/, "").replace(/\/+$/, "").replace(/\.git$/i, "");
  const parts = s.split("/");
  if (parts.length < 2) return null;
  const [owner, name] = parts;
  const ok = (x: string) => /^[A-Za-z0-9_.-]+$/.test(x) && x !== "." && x !== "..";
  if (!ok(owner) || !ok(name)) return null;
  // Chỉ chấp nhận link tới gốc repo hoặc /tree/<nhánh>, /blob/... (bỏ phần sau).
  if (/^https?:\/\//i.test(s)) return null; // còn giao thức tức là không phải github.com
  return { owner, name };
}

const repoFull = (r: RepoId) => `${r.owner}/${r.name}`;
export const repoHtmlUrl = (r: RepoId) => `https://github.com/${repoFull(r)}`;

/** Tên nhánh hợp lệ (rút gọn luật check-ref-format của git). */
export function validBranch(b: string): boolean {
  return (
    !!b &&
    b.length <= 200 &&
    !/[\s~^:?*\[\\]/.test(b) &&
    !b.includes("..") &&
    !b.includes("@{") &&
    !b.startsWith("/") &&
    !b.endsWith("/") &&
    !b.endsWith(".") &&
    !b.endsWith(".lock") &&
    !b.startsWith("-") &&
    !b.includes("//")
  );
}

const encPath = (p: string) => p.split("/").map(encodeURIComponent).join("/");

// ---------------------------------------------------------------- client REST tối giản

export class GitHubClient {
  constructor(
    public repo: RepoId,
    private token: string,
  ) {}

  /** Gọi API; trả `{ status, data }`. Lỗi mạng → GitHubError(0). Trạng thái lỗi trả về cho nơi gọi tự quyết, trừ khi `strict`. */
  async call(method: string, path: string, body?: unknown): Promise<{ status: number; data: any; rateLimited: boolean }> {
    const headers: Record<string, string> = {
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "ba-copilot",
    };
    if (this.token) headers.authorization = `Bearer ${this.token}`;
    if (body !== undefined) headers["content-type"] = "application/json";
    let res: Awaited<ReturnType<FetchLike>>;
    try {
      res = await doFetch(`${API()}/repos/${repoFull(this.repo)}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new GitHubError(NETWORK_ERROR, 0);
    }
    let data: any = null;
    try {
      const text = await res.text();
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    return { status: res.status, data, rateLimited: res.headers.get("x-ratelimit-remaining") === "0" };
  }

  /** Như `call` nhưng ném GitHubError (tiếng Việt) khi không phải 2xx. */
  async req(method: string, path: string, body?: unknown): Promise<any> {
    const r = await this.call(method, path, body);
    if (r.status >= 200 && r.status < 300) return r.data;
    throw this.error(r);
  }

  error(r: { status: number; data: any; rateLimited: boolean }): GitHubError {
    return new GitHubError(translateError(r.status, String(r.data?.message ?? ""), repoFull(this.repo), r.rateLimited), r.status);
  }

  /** Thông tin repo (nhánh mặc định, quyền của token). */
  repoInfo(): Promise<{ default_branch?: string; permissions?: { push?: boolean; admin?: boolean }; html_url?: string }> {
    return this.req("GET", "");
  }

  /** SHA commit đầu nhánh; null khi nhánh chưa có hoặc repo rỗng. */
  async branchSha(branch: string): Promise<string | null> {
    const r = await this.call("GET", `/git/ref/heads/${encPath(branch)}`);
    if (r.status === 200 && r.data?.object?.sha && !Array.isArray(r.data)) return String(r.data.object.sha);
    if (r.status === 404 || r.status === 409 || (r.status === 200 && Array.isArray(r.data))) return null;
    throw this.error(r);
  }
}

// ---------------------------------------------------------------- commit tệp

export interface CommitResult {
  sha: string;
  url: string;
  branch: string;
  createdBranch: boolean;
}

/**
 * Commit `files` lên `branch` trong một commit (Git Data API).
 * - Nhánh có sẵn: commit trên đầu nhánh, cập nhật ref (đụng nhau với lần đẩy khác → thử lại 1 lần).
 * - Nhánh chưa có: dựa trên đầu nhánh mặc định của repo rồi tạo ref mới trỏ vào commit.
 * - Repo rỗng: tạo README.md khởi tạo bằng Contents API trên nhánh mặc định rồi làm như trên.
 */
export async function commitFiles(gh: GitHubClient, branch: string, files: ExportFile[], message: string): Promise<CommitResult> {
  if (!files.length) throw new GitHubError("The artifact has no files to push.", 400);
  for (let attempt = 0; ; attempt++) {
    let parent = await gh.branchSha(branch);
    let createBranch = false;
    if (!parent) {
      createBranch = true;
      const info = await gh.repoInfo();
      const def = info.default_branch || "main";
      parent = await gh.branchSha(def);
      if (!parent) {
        // Repo rỗng: Git Data API không chạy được cho tới khi có commit đầu tiên.
        await gh.req("PUT", `/contents/README.md`, {
          message: "Initialise repository for BA Copilot",
          content: Buffer.from(`# ${gh.repo.name}\n\nDocuments, diagrams, prototypes and test cases approved by the BA Lead in BA Copilot.\n`, "utf8").toString("base64"),
        });
        parent = await gh.branchSha(def);
        if (!parent) throw new GitHubError("Could not initialise the empty repository on GitHub – try again.", 409);
        if (def === branch) createBranch = false;
      }
    }
    const parentCommit = await gh.req("GET", `/git/commits/${parent}`);
    const baseTree = String(parentCommit?.tree?.sha ?? "");
    const entries = [];
    for (const f of files) {
      const blob = await gh.req("POST", `/git/blobs`, { content: Buffer.from(f.content, "utf8").toString("base64"), encoding: "base64" });
      entries.push({ path: f.path, mode: "100644", type: "blob", sha: String(blob.sha) });
    }
    const tree = await gh.req("POST", `/git/trees`, { base_tree: baseTree, tree: entries });
    const commit = await gh.req("POST", `/git/commits`, { message, tree: String(tree.sha), parents: [parent] });
    const sha = String(commit.sha);
    const r = createBranch
      ? await gh.call("POST", `/git/refs`, { ref: `refs/heads/${branch}`, sha })
      : await gh.call("PATCH", `/git/refs/heads/${encPath(branch)}`, { sha, force: false });
    if (r.status >= 200 && r.status < 300) {
      return { sha, url: String(commit.html_url || `${repoHtmlUrl(gh.repo)}/commit/${sha}`), branch, createdBranch: createBranch };
    }
    // 422: nhánh vừa được người khác đẩy (không fast-forward) hoặc vừa được tạo → làm lại một lần trên đầu mới.
    if (r.status === 422 && attempt === 0) continue;
    throw gh.error(r);
  }
}

/** Commit mới nhất của nhánh (nhánh chưa có / repo rỗng → []). */
export async function listCommits(gh: GitHubClient, branch: string, limit = 30): Promise<GitCommit[]> {
  const r = await gh.call("GET", `/commits?sha=${encodeURIComponent(branch)}&per_page=${limit}`);
  if (r.status === 404 || r.status === 409) {
    // 404 có thể là nhánh chưa có (repo vẫn còn) → trả rỗng; repo không tồn tại → báo lỗi.
    if (r.status === 404) await gh.repoInfo();
    return [];
  }
  if (r.status < 200 || r.status >= 300) throw gh.error(r);
  return (Array.isArray(r.data) ? r.data : []).map((c: any) => ({
    sha: String(c.sha ?? ""),
    message: String(c.commit?.message ?? ""),
    author: String(c.commit?.author?.name ?? c.author?.login ?? ""),
    date: String(c.commit?.author?.date ?? c.commit?.committer?.date ?? ""),
    url: String(c.html_url ?? `${repoHtmlUrl(gh.repo)}/commit/${c.sha}`),
  }));
}

/** Thử kết nối: repo tồn tại, token có quyền ghi, nhánh đã có chưa. */
export async function testConnection(repoLink: string, token: string, branch: string): Promise<GitTestResult> {
  const repo = parseRepo(repoLink);
  if (!repo) return { ok: false, message: "Invalid repository link – paste it as https://github.com/<organization>/<repo>." };
  if (!token) return { ok: false, message: "No GitHub token yet – the BA Lead must paste the project's token and try again." };
  if (!validBranch(branch)) return { ok: false, message: `Invalid branch name "${branch}".` };
  const gh = new GitHubClient(repo, token);
  try {
    const info = await gh.repoInfo();
    const defaultBranch = info.default_branch || undefined;
    if (info.permissions && !info.permissions.push && !info.permissions.admin) {
      return { ok: false, message: `The token is read-only and cannot write to repository ${repoFull(repo)} – it needs the "Contents: Read and write" permission.`, defaultBranch };
    }
    const branchExists = !!(await gh.branchSha(branch));
    return {
      ok: true,
      message: branchExists
        ? `Connected to repository ${repoFull(repo)} with write access. Branch "${branch}" exists.`
        : `Connected to repository ${repoFull(repo)} with write access. Branch "${branch}" does not exist yet – the app will create it on the first approval.`,
      branchExists,
      defaultBranch,
    };
  } catch (e) {
    return { ok: false, message: e instanceof GitHubError ? e.message : NETWORK_ERROR };
  }
}

// ---------------------------------------------------------------- cấu hình dự án (bảng project_git)

interface GitRow {
  project_id: string;
  repo: string;
  token: string;
  branch: string;
  updated_by: string | null;
  updated_at: string;
}

const envToken = () => (process.env.GITHUB_TOKEN ?? "").trim();
const gitRow = (projectId: string) => getDb().prepare("SELECT * FROM project_git WHERE project_id = ?").get(projectId) as GitRow | undefined;

/** Cấu hình gửi ra client – KHÔNG có token. `hasToken` tính cả token mặc định của máy chủ (GITHUB_TOKEN). */
export function toProjectGit(r: GitRow): ProjectGit {
  return { projectId: r.project_id, repo: r.repo, branch: r.branch || "main", hasToken: !!(r.token || envToken()), updatedBy: r.updated_by, updatedAt: r.updated_at };
}

export function getProjectGit(projectId: string): ProjectGit | null {
  const r = gitRow(projectId);
  return r ? toProjectGit(r) : null;
}

/** Cấu hình đầy đủ (kèm token) – chỉ dùng trong server. null khi chưa đủ repo + token. */
export function resolveGitConfig(projectId: string): { repo: RepoId; token: string; branch: string } | null {
  const r = gitRow(projectId);
  const repo = r ? parseRepo(r.repo) : null;
  const token = (r?.token || envToken()).trim();
  if (!r || !repo || !token) return null;
  return { repo, token, branch: r.branch || "main" };
}

/** Token đã lưu của dự án (server dùng khi "Thử kết nối" không gửi token mới). */
export function storedToken(projectId: string): string {
  return (gitRow(projectId)?.token || envToken()).trim();
}

/**
 * Lưu cấu hình. `token`: thiếu hoặc chỉ có khoảng trắng = giữ token cũ; chuỗi rỗng "" = xoá token
 * (ô token để trống trên màn Cài đặt thì client KHÔNG gửi trường này).
 */
export function saveProjectGit(projectId: string, input: { repo?: unknown; branch?: unknown; token?: unknown }, actorId: string | null): ProjectGit {
  const d = getDb();
  const old = gitRow(projectId);
  const repo = typeof input.repo === "string" ? input.repo.trim() : (old?.repo ?? "");
  const branch = (typeof input.branch === "string" && input.branch.trim()) || "main";
  let token = old?.token ?? "";
  if (typeof input.token === "string") {
    if (input.token === "") token = "";
    else if (input.token.trim()) token = input.token.trim();
  }
  const by = actorId && d.prepare("SELECT 1 FROM members WHERE id = ?").get(actorId) ? actorId : null;
  d.prepare(
    `INSERT INTO project_git (project_id, repo, token, branch, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(project_id) DO UPDATE SET repo = excluded.repo, token = excluded.token, branch = excluded.branch,
       updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
  ).run(projectId, repo, token, branch, by, new Date().toISOString());
  return toProjectGit(gitRow(projectId)!);
}

// ---------------------------------------------------------------- nhật ký git_pushes

interface PushRow {
  id: string;
  project_id: string;
  module_id: string | null;
  artifact_kind: string;
  artifact_id: string;
  artifact_sub: string | null;
  task_id: string | null;
  branch: string;
  commit_sha: string;
  commit_url: string;
  message: string;
  files: string;
  by_member_id: string | null;
  created_at: string;
}

const toPush = (r: PushRow): GitPush => ({
  id: r.id,
  projectId: r.project_id,
  artifact: { kind: r.artifact_kind as ArtifactRef["kind"], id: r.artifact_id, moduleId: r.module_id ?? "", ...(r.artifact_sub ? { sub: r.artifact_sub as ArtifactRef["sub"] } : {}) },
  taskId: r.task_id,
  branch: r.branch,
  commitSha: r.commit_sha,
  commitUrl: r.commit_url,
  message: r.message,
  files: (() => {
    try {
      return JSON.parse(r.files) as string[];
    } catch {
      return [];
    }
  })(),
  byMemberId: r.by_member_id,
  createdAt: r.created_at,
});

export function listPushes(projectId: string, limit = 100): GitPush[] {
  return (getDb().prepare("SELECT * FROM git_pushes WHERE project_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?").all(projectId, limit) as unknown as PushRow[]).map(toPush);
}

// ---------------------------------------------------------------- Duyệt → đẩy lên GitHub

const memberName = (id: string | null | undefined) =>
  id ? ((getDb().prepare("SELECT name FROM members WHERE id = ?").get(id) as { name: string } | undefined)?.name ?? null) : null;

/** Người sửa cuối của sản phẩm (cột updated_by; màn hình thì lấy thêm người tạo phiên bản hiện tại). */
function lastEditor(ref: ArtifactRef, moduleId: string): string | null {
  const d = getDb();
  let by: string | null = null;
  let author: string | null = null;
  if (ref.kind === "screen") {
    const r = d
      .prepare("SELECT s.updated_by AS by, v.author AS author, v.author_id AS author_id FROM screens s LEFT JOIN screen_versions v ON v.id = s.current_version_id WHERE s.id = ?")
      .get(ref.id) as { by: string | null; author: string | null; author_id: string | null } | undefined;
    by = r?.by ?? r?.author_id ?? null;
    author = r?.author ?? null;
  } else if (ref.kind === "doc") {
    by = (d.prepare("SELECT updated_by AS by FROM module_docs WHERE module_id = ? AND kind = ?").get(moduleId, ref.sub ?? "") as { by: string | null } | undefined)?.by ?? null;
  } else if (ref.kind === "diagram") {
    by = (d.prepare("SELECT updated_by AS by FROM module_diagrams WHERE module_id = ? AND kind = ?").get(moduleId, ref.sub ?? "UC") as { by: string | null } | undefined)?.by ?? null;
  } else if (ref.kind === "tests") {
    by = (d.prepare("SELECT tests_updated_by AS by FROM modules WHERE id = ?").get(moduleId) as { by: string | null } | undefined)?.by ?? null;
  }
  return memberName(by) ?? author;
}

/** Task gắn với sản phẩm (mới cập nhật nhất), để ghi vào git_pushes. */
function taskOf(ref: ArtifactRef, projectId: string): string | null {
  const r = getDb()
    .prepare(
      `SELECT id FROM tasks WHERE project_id = ? AND artifact_type = ? AND artifact_id = ?
         AND (? IS NULL OR artifact_sub IS NULL OR artifact_sub = ?) ORDER BY updated_at DESC LIMIT 1`,
    )
    .get(projectId, ref.kind, ref.id, ref.sub ?? null, ref.sub ?? null) as { id: string } | undefined;
  return r?.id ?? null;
}

export const NOT_CONFIGURED = "GitHub is not configured – nothing was pushed";

/**
 * Hàm đẩy khi BA Lead Duyệt (đăng ký vào server/events.ts). Chưa cấu hình → `{ pushed: false }`.
 * Đã cấu hình: commit đúng các tệp của sản phẩm, ghi `git_pushes`, trả sha + link. Lỗi GitHub → ném lỗi
 * (C7 giữ nguyên trạng thái sản phẩm và báo lý do).
 */
export async function pushApprovedToGitHub(ref: ArtifactRef, actorId: string | null): Promise<GitPushOutcome> {
  const exp = buildExport(ref);
  const cfg = resolveGitConfig(exp.projectId);
  if (!cfg) return { pushed: false, message: NOT_CONFIGURED };
  const editor = lastEditor(ref, exp.moduleId) ?? "unknown";
  const lead = memberName(actorId) ?? "BA Lead";
  const message = `Approved: ${exp.label} – ${exp.moduleName} · BA ${editor} · approved by ${lead}`;
  const gh = new GitHubClient(cfg.repo, cfg.token);
  const res = await commitFiles(gh, cfg.branch, exp.files, message);
  const d = getDb();
  const by = actorId && d.prepare("SELECT 1 FROM members WHERE id = ?").get(actorId) ? actorId : null;
  d.prepare(
    `INSERT INTO git_pushes (id, project_id, module_id, artifact_kind, artifact_id, artifact_sub, task_id, branch, commit_sha, commit_url, message, files, by_member_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    exp.projectId,
    exp.moduleId,
    ref.kind,
    ref.id,
    ref.kind === "doc" || ref.kind === "diagram" ? (ref.sub ?? (ref.kind === "diagram" ? "UC" : null)) : null,
    taskOf(ref, exp.projectId),
    res.branch,
    res.sha,
    res.url,
    message,
    JSON.stringify(exp.files.map((f) => f.path)),
    by,
    new Date().toISOString(),
  );
  return {
    pushed: true,
    message: `Pushed ${exp.files.length} file(s) to GitHub (branch ${res.branch}${res.createdBranch ? ", newly created" : ""}, commit ${res.sha.slice(0, 7)}).`,
    commitSha: res.sha,
    commitUrl: res.url,
  };
}

registerApprovedPusher(pushApprovedToGitHub);
