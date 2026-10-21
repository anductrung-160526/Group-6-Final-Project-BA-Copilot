// Quản trị hệ thống (#/admin, đợt 5 – chuyển từ MembersView): thành viên và vai BA / BA Lead, không có mật khẩu.
// Chủ sở hữu: C3. Chỉ BA Lead (người đang chọn ở ô "Tôi là…") vào được; ngoại lệ khi hệ thống chưa có BA Lead nào
// thì ai cũng vào được để tạo người đầu tiên. Server chặn lại đúng luật đó (server/routes/members.ts).
import React, { useState } from "react";
import type { MemberRole } from "../../shared/types.ts";
import { Avatar, Badge, Btn, Empty, Field, Icon, Modal, RowActions, Select, fmtTime, useUI } from "../components/ui.tsx";
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
    const r = await run("Saving", () => (form.id ? updateMember(form.id, body) : createMember(body)));
    if (!r) return;
    toast(form.id ? `${r.name} updated` : `${r.name} added`, "ok");
    setForm(null);
    await reload();
  };
  const remove = async (id: string, name: string) => {
    const r = await run("Deleting", () => deleteMemberAsActor(id));
    if (!r) return;
    toast(`${name} deleted`, "ok");
    await reload();
  };

  if (!loaded) return <div className="page muted">Loading…</div>;
  if (!allowed)
    return (
      <div className="page" data-testid="admin-forbidden">
        <Empty title="Only a BA Lead can access this page">Select a BA Lead's name in the "Acting as" box on the top bar to manage members.</Empty>
      </div>
    );

  return (
    <div className="page" data-testid="members-view">
      <div className="page-head">
        <div>
          <h1>Administration</h1>
          <p className="muted">Team members and roles. A BA Lead approves artifacts and manages members; the person selected in the "Acting as" box is recorded as the actor.</p>
        </div>
        <Btn kind="primary" onClick={() => setForm({ id: null, name: "", role: hasLead ? "BA" : "BA_LEAD" })} data-testid="new-member">
          <Icon name="plus" size="sm" />
          Add member
        </Btn>
      </div>

      {!hasLead && (
        <div className="notice notice-warn" role="status" data-testid="admin-no-lead">
          <span className="notice-text">There is no BA Lead yet, so anyone can manage members. Add a BA Lead first – after that only a BA Lead can add, edit or delete members.</span>
        </div>
      )}

      {!members.length ? (
        <Empty title="No members yet">Add the BAs in your team to assign tasks and record who did the work.</Empty>
      ) : (
        <div className="table-wrap">
          <table className="tbl" data-testid="members-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Added on</th>
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
                      {m.id === me?.id && <Badge tone="mint">You</Badge>}
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
                        title: `Remove ${m.name} from the team?`,
                        message: "This person's name is kept on the comments and versions they created. Members with unfinished tasks cannot be deleted.",
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
          title={form.id ? "Edit member" : "Add member"}
          onClose={() => setForm(null)}
          footer={
            <>
              <Btn onClick={() => setForm(null)}>Cancel</Btn>
              <Btn kind="primary" disabled={!form.name.trim()} onClick={save} data-testid="save-member">
                {form.id ? "Save" : "Add"}
              </Btn>
            </>
          }
        >
          <Field label="Full name">
            <input
              autoFocus
              value={form.name}
              maxLength={80}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && form.name.trim() && save()}
              placeholder="e.g. Sarah Johnson"
              data-testid="member-name"
            />
          </Field>
          <Field label="Role" hint="A BA Lead approves documents, diagrams, prototypes and test cases, and manages members.">
            <Select value={form.role} options={ROLE_OPTIONS} onChange={(v) => v && setForm({ ...form, role: v })} testId="member-role" />
          </Field>
        </Modal>
      )}
    </div>
  );
}
