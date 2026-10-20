// SCR-01 – Thành viên nhóm (FN-01): bảng thành viên, hộp thoại thêm/sửa, xác nhận xoá. Chủ sở hữu: A3.
import React, { useState } from "react";
import type { Member, MemberRole } from "../../shared/types.ts";
import { Avatar, Badge, Btn, Empty, Field, Modal, Select, fmtTime, useUI } from "../components/ui.tsx";
import { createMember, deleteMember, updateMember } from "../api.ts";
import { ROLE_LABEL, useCurrentMember } from "../currentMember.ts";
import type { PageProps } from "../routes.ts";
const ROLE_OPTIONS = (Object.keys(ROLE_LABEL) as MemberRole[]).map((r) => ({ value: r, label: ROLE_LABEL[r] }));

type Form = { id: string | null; name: string; role: MemberRole };

export function MembersView(_: PageProps) {
  const { me, members, loaded, reload } = useCurrentMember();
  const { run, toast } = useUI();
  const [form, setForm] = useState<Form | null>(null);
  const [removing, setRemoving] = useState<Member | null>(null);

  const save = async () => {
    if (!form) return;
    const body = { name: form.name.trim(), role: form.role };
    const r = await run("Đang lưu", () => (form.id ? updateMember(form.id, body) : createMember(body)));
    if (!r) return;
    toast(form.id ? `Đã cập nhật ${r.name}` : `Đã thêm ${r.name}`, "ok");
    setForm(null);
    await reload();
  };
  const remove = async () => {
    if (!removing) return;
    const r = await run("Đang xoá", () => deleteMember(removing.id));
    setRemoving(null);
    if (!r) return;
    toast(`Đã xoá ${removing.name}`, "ok");
    await reload();
  };

  return (
    <div className="page" data-testid="members-view">
      <div className="page-head">
        <div>
          <h1>Thành viên nhóm</h1>
          <p className="muted">Danh sách BA của nhóm. Người được chọn ở ô "Tôi là…" trên thanh trên sẽ được ghi làm tác giả bình luận và phiên bản thiết kế.</p>
        </div>
        <Btn kind="primary" onClick={() => setForm({ id: null, name: "", role: "BA" })} data-testid="new-member">
          + Thêm thành viên
        </Btn>
      </div>

      {!loaded ? (
        <div className="muted">Đang tải…</div>
      ) : !members.length ? (
        <Empty title="Chưa có thành viên nào">Thêm các BA trong nhóm để giao việc và ghi tên người làm.</Empty>
      ) : (
        <table className="tbl" data-testid="members-table">
          <thead>
            <tr>
              <th>Tên</th>
              <th>Vai trò</th>
              <th>Ngày thêm</th>
              <th />
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
                <td className="muted small">{fmtTime(m.createdAt)}</td>
                <td>
                  <span className="member-picker">
                    <button className="link small" onClick={() => setForm({ id: m.id, name: m.name, role: m.role })} data-testid="edit-member">
                      Sửa
                    </button>
                    <button className="link-danger small" onClick={() => setRemoving(m)} data-testid="delete-member">
                      Xoá
                    </button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
          <Field label="Vai trò" hint="BA Lead là người duyệt thiết kế, tài liệu và sơ đồ.">
            <Select value={form.role} options={ROLE_OPTIONS} onChange={(v) => v && setForm({ ...form, role: v })} testId="member-role" />
          </Field>
        </Modal>
      )}

      {removing && (
        <Modal
          title="Xoá thành viên"
          onClose={() => setRemoving(null)}
          footer={
            <>
              <Btn onClick={() => setRemoving(null)}>Huỷ</Btn>
              <Btn kind="danger" onClick={remove} data-testid="confirm-delete-member">
                Xoá
              </Btn>
            </>
          }
        >
          <p>
            Xoá <strong>{removing.name}</strong> khỏi nhóm? Tên người này vẫn được giữ trên các bình luận và phiên bản đã tạo.
          </p>
          <p className="muted small">Không xoá được nếu người này còn công việc chưa xong.</p>
        </Modal>
      )}
    </div>
  );
}
