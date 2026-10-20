// GitHub của dự án: cài đặt repo, thử kết nối, lịch sử (kế hoạch đợt 5, mục 3 "C8"). Chủ sở hữu: C8.
// Hợp đồng: docs/api.md "Đợt 5" mục 5.6. Bảng `project_git` (token KHÔNG BAO GIỜ trả về client – chỉ `hasToken`), `git_pushes`.
// GET: requireMember. PUT và POST test: chỉ BA Lead – người thao tác (actorId / phiên) phải là BA Lead,
// thiếu người thao tác cũng chặn 403 (chặt hơn requireLead của chế độ demo).
// Import server/github.ts ở đây để hàm đẩy khi Duyệt chắc chắn được đăng ký (registerApprovedPusher).

import { getDb } from "../db.ts";
import { HttpError, requireMember, route, type HandlerCtx } from "../http.ts";
import {
  GitHubClient,
  GitHubError,
  getProjectGit,
  listCommits,
  listPushes,
  parseRepo,
  resolveGitConfig,
  saveProjectGit,
  storedToken,
  testConnection,
  validBranch,
} from "../github.ts";
import type { GitHistory } from "../../shared/types.ts";

function assertProject(id: string): void {
  if (!getDb().prepare("SELECT 1 FROM projects WHERE id = ?").get(id)) throw new HttpError("Không tìm thấy dự án", 404);
}

/** Chỉ BA Lead (kể cả chế độ demo): không rõ người thao tác hoặc là BA → 403. */
function strictLead(ctx: HandlerCtx): string {
  const m = requireMember(ctx);
  if (!m || m.role !== "BA_LEAD") throw new HttpError("Chỉ BA Lead được cài đặt GitHub cho dự án", 403, "FORBIDDEN");
  return m.id;
}

route("GET", "/api/projects/:id/git", (ctx) => {
  requireMember(ctx);
  assertProject(ctx.params.id);
  return getProjectGit(ctx.params.id);
});

route("PUT", "/api/projects/:id/git", (ctx) => {
  const by = strictLead(ctx);
  assertProject(ctx.params.id);
  const b = ctx.body ?? {};
  const repo = typeof b.repo === "string" ? b.repo.trim() : "";
  if (repo && !parseRepo(repo)) throw new HttpError("Link repo không hợp lệ – dán dạng https://github.com/<tổ chức>/<repo>", 400);
  const branch = typeof b.branch === "string" && b.branch.trim() ? b.branch.trim() : "main";
  if (!validBranch(branch)) throw new HttpError(`Tên nhánh "${branch}" không hợp lệ`, 400);
  if (b.token !== undefined && b.token !== null && typeof b.token !== "string") throw new HttpError("Token không hợp lệ", 400);
  return saveProjectGit(ctx.params.id, { repo, branch, token: typeof b.token === "string" ? b.token : undefined }, by);
});

route("POST", "/api/projects/:id/git/test", async (ctx) => {
  strictLead(ctx);
  assertProject(ctx.params.id);
  const b = ctx.body ?? {};
  const saved = getProjectGit(ctx.params.id);
  const repo = typeof b.repo === "string" && b.repo.trim() ? b.repo.trim() : (saved?.repo ?? "");
  const branch = typeof b.branch === "string" && b.branch.trim() ? b.branch.trim() : (saved?.branch ?? "main");
  const token = typeof b.token === "string" && b.token.trim() ? b.token.trim() : storedToken(ctx.params.id);
  return testConnection(repo, token, branch);
});

route("GET", "/api/projects/:id/git/history", async (ctx) => {
  requireMember(ctx);
  assertProject(ctx.params.id);
  const saved = getProjectGit(ctx.params.id);
  const cfg = resolveGitConfig(ctx.params.id);
  // `commitsError` là trường thêm (REQUESTS R-090): lỗi đọc commit từ GitHub không làm mất nhật ký trong app.
  const out: GitHistory & { commitsError?: string } = {
    configured: !!cfg,
    repo: saved?.repo ?? "",
    branch: saved?.branch ?? "main",
    commits: [],
    pushes: listPushes(ctx.params.id),
  };
  if (cfg) {
    try {
      out.commits = await listCommits(new GitHubClient(cfg.repo, cfg.token), cfg.branch);
    } catch (e) {
      out.commitsError = e instanceof GitHubError ? e.message : "Không đọc được lịch sử commit từ GitHub.";
    }
  }
  return out;
});
