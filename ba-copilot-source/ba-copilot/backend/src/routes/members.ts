// Thành viên nhóm + Quản trị hệ thống (FN-01 → FN-03, đợt 5). Hợp đồng: docs/api.md mục "Thành viên". Chủ sở hữu: C3.
// Đợt 5 (quyết định 15 – không đăng nhập): thêm / sửa / xoá thành viên chỉ dành cho BA Lead, xét theo người thao tác
// (`actorId` ở body hoặc query, chế độ member thì lấy từ phiên). Ngoại lệ: hệ thống chưa có BA Lead nào thì ai cũng
// làm được – để tạo người đầu tiên.
// Nhóm luôn phải còn ít nhất một BA Lead: BA Lead không tự hạ vai / tự xoá mình, không hạ vai / xoá BA Lead cuối (400).
// Tên thành viên không trùng (trim, không phân biệt hoa/thường – projectNameKey) khi thêm và đổi tên → 409.

import * as members from "../repo/members.ts";
import * as repo from "../repo.ts";
import { MSG, projectDescError, projectNameError } from "../../../shared/projectName.ts";
import { BizError } from "../service.ts";
import { currentMember, HttpError, route, str, type HandlerCtx } from "../http.ts";
import { on } from "../events.ts";
import type { Member, MemberRole } from "../../../shared/types.ts";

const name = (v: unknown) => {
  const n = str(v, 80).trim();
  if (!n) throw new BizError("Member name is required");
  return n;
};
const role = (v: unknown): MemberRole => {
  if (!members.MEMBER_ROLES.includes(v as MemberRole)) throw new BizError("Role must be BA or BA Lead");
  return v as MemberRole;
};
const mustMember = (id: string) => {
  const m = members.getMember(id);
  if (!m) throw new BizError("Member not found", 404);
  return m;
};

/** Tên chưa có người khác dùng (bỏ qua `exceptId` – đổi về chính tên mình, kể cả chỉ đổi hoa/thường, vẫn được). */
const uniqueName = (n: string, exceptId?: string) => {
  if (members.findMemberByName(n, exceptId)) throw new BizError(MSG.duplicateMember(n), 409);
  return n;
};

/**
 * Chặn 403 khi người thao tác không phải BA Lead; hệ thống chưa có BA Lead thì cho qua.
 * Trả về người thao tác (null khi chưa có BA Lead và không rõ người thao tác).
 */
export function requireAdmin(ctx: Pick<HandlerCtx, "req" | "body" | "query">): Member | null {
  const me = currentMember(ctx);
  if (!members.hasLead()) return me;
  if (!me || me.role !== "BA_LEAD") throw new HttpError("Only a BA Lead can manage members", 403, "FORBIDDEN");
  return me;
}

/** BA Lead `m` sắp mất vai (hạ xuống BA hoặc bị xoá): không phải chính người thao tác, không phải BA Lead cuối. */
function assertKeepsLead(m: Member, me: Member | null, action: "demote" | "delete") {
  if (m.role !== "BA_LEAD") return;
  if (me?.id === m.id)
    throw new BizError(action === "demote" ? "You can't remove your own BA Lead role. Ask another BA Lead to change it." : "You can't delete yourself. Ask another BA Lead to remove you.");
  if (members.countLeads() <= 1)
    throw new BizError(`${m.name} is the only BA Lead. Make another member a BA Lead before ${action === "demote" ? "changing this role" : "deleting this member"}.`);
}

route("GET", "/api/members", () => members.listMembers());
route("POST", "/api/members", (ctx) => {
  requireAdmin(ctx);
  return members.createMember({ name: uniqueName(name(ctx.body.name)), role: role(ctx.body.role) });
});
route("PATCH", "/api/members/:id", (ctx) => {
  const me = requireAdmin(ctx);
  const { params, body } = ctx;
  const m = mustMember(params.id);
  const patch = {
    name: body.name !== undefined ? uniqueName(name(body.name), m.id) : undefined,
    role: body.role !== undefined ? role(body.role) : undefined,
  };
  if (patch.role === "BA") assertKeepsLead(m, me, "demote");
  return members.updateMember(params.id, patch);
});
route("DELETE", "/api/members/:id", (ctx) => {
  const me = requireAdmin(ctx);
  const m = mustMember(ctx.params.id);
  assertKeepsLead(m, me, "delete");
  const open = members.countOpenTasks(m.id);
  if (open) throw new BizError(`${m.name} is assigned to ${open} unfinished task(s). Reassign those tasks before deleting.`, 409);
  members.deleteMember(m.id);
  return { ok: true };
});

// TẠM (R-041): sửa tên / mô tả dự án cho nút Sửa ở trang chủ. app.ts + repo.ts (khoá / của agent khác) chưa có
// route này nên đăng ký tạm ở đây; C0 chuyển sang app.ts + repo.updateProject khi gộp rồi xoá khối này.
// Cùng luật với POST /api/projects (shared/projectName.ts): trim, quá dài → 400 (không cắt), trùng tên dự án KHÁC → 409;
// đổi về chính tên của mình (kể cả chỉ đổi hoa/thường) vẫn được. Kiểm tra hết rồi mới ghi.
route("PATCH", "/api/projects/:id", ({ params, body }) => {
  if (!repo.getProject(params.id)) throw new BizError("Project not found", 404);
  const patch: { name?: string; description?: string } = {};
  if (body.name !== undefined) {
    const n = typeof body.name === "string" ? body.name.trim() : "";
    const err = projectNameError(n);
    if (err) throw new BizError(err);
    if (repo.findProjectByName(n, params.id)) throw new BizError(MSG.duplicateProject(n), 409);
    patch.name = n;
  }
  if (body.description !== undefined) {
    const d = typeof body.description === "string" ? body.description.trim() : "";
    const err = projectDescError(d);
    if (err) throw new BizError(err);
    patch.description = d;
  }
  repo.updateProject(params.id, patch);
  return repo.getProject(params.id);
});

// FN-03: mọi lần tạo phiên bản màn (tạo, sửa bằng prompt, khôi phục, nhận gợi ý bố cục, sửa tay) service đều phát
// `artifact.drafted` kèm actorId ngay sau khi thêm phiên bản, trong cùng transaction → ghi tác giả vào phiên bản đó.
on("artifact.drafted", (e) => {
  if (e.artifact.kind !== "screen" || !e.actorId) return;
  const m = members.getMember(e.actorId);
  const versionId = m && members.currentVersionId(e.artifact.id);
  if (m && versionId) members.stampVersionAuthor(versionId, m);
});
