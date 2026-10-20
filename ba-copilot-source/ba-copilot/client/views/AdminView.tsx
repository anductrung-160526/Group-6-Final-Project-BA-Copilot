// Quản trị hệ thống (#/admin, đợt 5 – chuyển từ MembersView): thành viên và vai BA / BA Lead, không có mật khẩu.
// Chủ sở hữu: C3. Chỉ BA Lead (người đang chọn ở ô "Tôi là…") vào được; ngoại lệ khi hệ thống chưa có BA Lead nào
// thì ai cũng vào được để tạo người đầu tiên. Server chặn lại đúng luật đó (server/routes/members.ts).
import React, { useState } from "react";
import type { MemberRole } from "../../shared/types.ts";
import { Avatar, Badge, Btn, Empty, Field, Modal, RowActions, Select, fmtTime, useUI } from "../components/ui.tsx";
import { createMember, del, updateMember } from "../api.ts";
import { ROLE_LABEL, currentMemberId, useCurrentMember, withActor } from "../currentMember.ts";
import type { PageProps } from "../routes.ts";

const ROLE_OPTIONS = (Object.keys(ROLE_LABEL) as MemberRole[]).map((r) => ({ value: r, label: ROLE_LABEL[r] }));

type Form = { id: string | null; name: string; role: MemberRole };

/** Xoá thành viên kèm người thao tác (DELETE không có body → gửi actorId qua query). */
const deleteMemberAsActor = (id: string) => {
  const actorId = currentMemberId();
  return del<{ ok: true }>(`/api/members/${encodeURIComponent(id)}${actorId ? `?actorId=${encodeURIComponent(actorId)}` : ""}`);
};

export function AdminView(_: PageProps) {
  const { me, members, loaded, reload } = useCurrentMember();
  const { run, toast } = useUI();
  const [form, setForm] = useState<Form | null>(null);

  const hasLead = members.some((m) => m.role === "BA_LEAD");
  const allowed = !hasLead || me?.role === "BA_LEAD";

  const save = async () => {
    if (!form) return;
    const body = withActor({ name: form.name.trim(), role: form.role });
    const r = await run("Đang lưu", () => (form.id ? updateMember(form.id, body) : createMember(body)));
    if (!r) return;
    toast(form.id ? `Đã cập nhật ${r.name}` : `Đã thêm ${r.name}`, "ok");
    setForm(null);
    await reload();
  };
  const remove = async (id: string, name: string) => {
    const r = await run("Đang xoá", () => deleteMemberAsActor(id));
    if (!r) return;
    toast(`Đã xoá ${name}`, "ok");
    await reload();
  };

  if (!loaded) return <div className="page muted">Đang tải…</div>;
  if (!allowed)
    return (
      <div className="page" data-testid="admin-forbidden">
        <Empty title="Chỉ BA Lead truy cập được">Chọn tên một BA Lead ở ô "Tôi là…" trên thanh trên để quản trị thành viên.</Empty>
      </div>
    );

  return (
    <div className="page" data-testid="members-view">
      <div className="page-head">
        <div>
          <h1>Quản trị hệ thống</h1>
          <p className="muted">Thành viên nhóm và vai trò. BA Lead duyệt sản phẩm và quản trị thành viên; người được chọn ở ô "Tôi là…" được ghi làm người thao tác.</p>
        </div>
        <Btn kind="primary" onClick={() => setForm({ id: null, name: "", role: hasLead ? "BA" : "BA_LEAD" })} data-testid="new-member">
          + Thêm thành viên
        </Btn>
      </div>

      {!hasLead && (
        <div className="notice notice-warn" role="status" data-testid="admin-no-lead">
          <span className="notice-text">Hệ thống chưa có BA Lead nên ai cũng quản trị được. Hãy thêm một BA Lead trước – sau đó chỉ BA Lead mới thêm, sửa, xoá thành viên.</span>
        </div>
      )}

      {!members.length ? (
        <Empty title="Chưa có thành viên nào">Thêm các BA trong nhóm để giao việc và ghi tên người làm.</Empty>
      ) : (
        <div className="table-wrap">
          <table className="tbl" data-testid="members-table">
            <thead>
              <tr>
                <th>Tên</th>
                <th>Vai trò</th>
                <th>Ngày thêm</th>
                <th className="actions" />
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className={m.id === me?.id ? "selected" : ""} data-testid="member-row">
                  <td>
                    <span className="member-picker">
                      <Avatar name={m.name} size="sm" />
                      <strong>{m.name}</strong>
                      {m.id === me?.id && <Badge tone="mint">Bạn</Badge>}
                    </span>
                  </td>
                  <td>
                    <Badge tone={m.role === "BA_LEAD" ? "violet" : "gray"}>{ROLE_LABEL[m.role]}</Badge>
                  </td>
                  <td className="muted small nowrap">{fmtTime(m.createdAt)}</td>
                  <td className="actions">
                    <RowActions
                      testId={`member-${m.id}`}
                      onEdit={() => setForm({ id: m.id, name: m.name, role: m.role })}
                      onDelete={() => remove(m.id, m.name)}
                      deleteConfirm={{
                        title: `Xoá ${m.name} khỏi nhóm?`,
                        message: "Tên người này vẫn được giữ trên các bình luận và phiên bản đã tạo. Không xoá được nếu người này còn công việc chưa xong.",
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {form && (
        <Modal
          title={form.id ? "Sửa thành viên" : "Thêm thành viên"}
          onClose={() => setForm(null)}
          footer={
            <>
              <Btn onClick={() => setForm(null)}>Huỷ</Btn>
              <Btn kind="primary" disabled={!form.name.trim()} onClick={save} data-testid="save-member">
                {form.id ? "Lưu" : "Thêm"}
              </Btn>
            </>
          }
        >
          <Field label="Họ tên">
            <input
              autoFocus
              value={form.name}
              maxLength={80}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && form.name.trim() && save()}
              placeholder="VD: Nguyễn Thị Lan"
              data-testid="member-name"
            />
          </Field>
          <Field label="Vai trò" hint="BA Lead duyệt tài liệu, sơ đồ, prototype, test case và quản trị thành viên.">
            <Select value={form.role} options={ROLE_OPTIONS} onChange={(v) => v && setForm({ ...form, role: v })} testId="member-role" />
          </Field>
        </Modal>
      )}
    </div>
  );
}
