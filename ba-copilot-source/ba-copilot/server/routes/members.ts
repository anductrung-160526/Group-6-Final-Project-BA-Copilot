// Thành viên nhóm (FN-01 → FN-03). Hợp đồng: docs/api.md mục "Thành viên". Chủ sở hữu: A3.

import * as members from "../repo/members.ts";
import { BizError } from "../service.ts";
import { route, str } from "../http.ts";
import { on } from "../events.ts";
import type { MemberRole } from "../../shared/types.ts";

const name = (v: unknown) => {
  const n = str(v, 80).trim();
  if (!n) throw new BizError("Tên thành viên không được để trống");
  return n;
};
const role = (v: unknown): MemberRole => {
  if (!members.MEMBER_ROLES.includes(v as MemberRole)) throw new BizError("Vai trò phải là BA hoặc BA Lead");
  return v as MemberRole;
};
const mustMember = (id: string) => {
  const m = members.getMember(id);
  if (!m) throw new BizError("Không tìm thấy thành viên", 404);
  return m;
};

route("GET", "/api/members", () => members.listMembers());
route("POST", "/api/members", ({ body }) => members.createMember({ name: name(body.name), role: role(body.role) }));
route("PATCH", "/api/members/:id", ({ params, body }) => {
  mustMember(params.id);
  return members.updateMember(params.id, {
    name: body.name !== undefined ? name(body.name) : undefined,
    role: body.role !== undefined ? role(body.role) : undefined,
  });
});
route("DELETE", "/api/members/:id", ({ params }) => {
  const m = mustMember(params.id);
  const open = members.countOpenTasks(m.id);
  if (open) throw new BizError(`${m.name} đang phụ trách ${open} công việc chưa xong. Hãy giao lại các công việc đó trước khi xoá.`, 409);
  members.deleteMember(m.id);
  return { ok: true };
});

// FN-03: mọi lần tạo phiên bản màn (tạo, sửa bằng prompt, khôi phục, nhận gợi ý bố cục, sửa tay) service đều phát
// `artifact.drafted` kèm actorId ngay sau khi thêm phiên bản, trong cùng transaction → ghi tác giả vào phiên bản đó.
on("artifact.drafted", (e) => {
  if (e.artifact.kind !== "screen" || !e.actorId) return;
  const m = members.getMember(e.actorId);
  const versionId = m && members.currentVersionId(e.artifact.id);
  if (m && versionId) members.stampVersionAuthor(versionId, m);
});
