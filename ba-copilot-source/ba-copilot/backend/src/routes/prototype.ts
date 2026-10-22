// Prototype, test case – route của C9 (kế hoạch đợt 5, mục 3 "C9"). Hợp đồng: docs/api.md "Đợt 5" mục 5.7.
// - GET /api/screens/:id/export/html: màn hình → HTML tĩnh tự chứa (shared/exportHtml.ts). `?inline=1` để xem ngay trong trình duyệt.
// - POST /api/modules/:id/tests/generate: thay route cũ trong app.ts (tệp route đăng ký trước app.ts nên được ưu tiên – xem
//   matchRoute) để nhận `baseRev` (chặn đè bộ test, 409 CONFLICT) và chặn khi FRD-NFR chưa Xong. Body/kết quả giữ như cũ: TestCase[].
//   C0: bỏ route trùng trong app.ts khi dọn (REQUESTS R-101).
// - GET /api/modules/:id/tests/readiness: điều kiện sinh test case (để màn hiện lý do chặn).

import * as repo from "../repo.ts";
import * as svc from "../service.ts";
import { actor, baseRevOf, FileResponse, requireMember, route } from "../http.ts";
import { screenToHtml } from "../../../shared/exportHtml.ts";

function fileSafe(s: string) {
  return (
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/đ/g, "d") // vi-keep: bỏ dấu tiếng Việt trong tên tệp
      .replace(/Đ/g, "D") // vi-keep: bỏ dấu tiếng Việt trong tên tệp
      .replace(/[^\w-]+/g, "_")
      .slice(0, 60) || "screen"
  );
}

route("GET", "/api/screens/:id/export/html", (ctx) => {
  requireMember(ctx);
  const s = repo.getScreen(ctx.params.id);
  const v = s?.currentVersionId ? repo.getVersion(s.currentVersionId) : null;
  if (!s || !v) throw new svc.BizError("Screen not found", 404);
  const html = screenToHtml(v.tree, { title: s.name, footer: `${s.name} – version v${v.number} · exported from BA Copilot` });
  return new FileResponse(Buffer.from(html, "utf8"), `${fileSafe(s.name)}.html`, "text/html; charset=utf-8", ctx.query.get("inline") === "1" ? "inline" : "attachment");
});

route("POST", "/api/modules/:id/tests/generate", (ctx) => {
  requireMember(ctx);
  return svc.generateTests(ctx.params.id, actor(ctx.body), baseRevOf(ctx.body));
});

route("GET", "/api/modules/:id/tests/readiness", (ctx) => {
  requireMember(ctx);
  return svc.testsReadiness(ctx.params.id);
});
