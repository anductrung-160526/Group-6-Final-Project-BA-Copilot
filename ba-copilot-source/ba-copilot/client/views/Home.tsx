// Trang chủ (đợt 5): danh sách dự án – tạo, sửa, xoá. Bấm vào dự án mở thẳng "Quản lý công việc". Chủ sở hữu: C3.
import React, { useEffect, useRef, useState } from "react";
import { ApiError, del, get, patch, post } from "../api.ts";
import { Btn, Empty, Field, Icon, Modal, RowActions, fmtTime, useUI } from "../components/ui.tsx";
import { projectHref } from "../projectMenu.ts";
import { MSG, PROJECT_DESC_MAX, PROJECT_NAME_MAX, projectNameKey } from "../../shared/projectName.ts";

interface P {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  moduleCount: number;
}

type Draft = { name: string; description: string };
const EMPTY: Draft = { name: "", description: "" };
/** Lỗi dữ liệu máy chủ trả về (409 trùng tên, 400 quá dài…) – hiện dưới đúng ô, giữ hộp thoại mở. */
type ServerErr = { field: "name" | "description"; msg: string };

const DUPLICATE_MSG = "A project with this name already exists. Please choose another name.";

export function Home() {
  const { run, toast } = useUI();
  const [projects, setProjects] = useState<P[] | null>(null);
  /** Hộp thoại đang mở: `id = null` là tạo mới, có `id` là sửa dự án đó. */
  const [dialog, setDialog] = useState<{ id: string | null } | null>(null);
  // Nháp "New project" giữ riêng: Esc / bấm nền / × chỉ đóng, mở lại vẫn còn; "Cancel" mới xoá.
  // Nháp "Edit" luôn nạp lại từ giá trị hiện tại của dự án mỗi lần mở.
  const [newDraft, setNewDraft] = useState<Draft>(EMPTY);
  const [editDraft, setEditDraft] = useState<Draft>(EMPTY);
  const [serverErr, setServerErr] = useState<ServerErr | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const load = () => get<P[]>("/api/projects").then(setProjects).catch((e) => toast(e.message, "err"));
  useEffect(() => {
    load();
  }, []);

  const editing = !!dialog?.id;
  const draft = editing ? editDraft : newDraft;
  const setDraft = editing ? setEditDraft : setNewDraft;

  // Kiểm tra ngay khi gõ – cùng quy tắc với máy chủ (shared/projectName.ts); bỏ qua chính dự án đang sửa.
  const key = projectNameKey(draft.name);
  const duplicate = !!key && !!projects?.some((p) => p.id !== dialog?.id && projectNameKey(p.name) === key);
  const nameError = duplicate
    ? DUPLICATE_MSG
    : draft.name.trim().length > PROJECT_NAME_MAX
      ? MSG.projectNameTooLong
      : serverErr?.field === "name"
        ? serverErr.msg
        : null;
  const descError = draft.description.trim().length > PROJECT_DESC_MAX ? MSG.projectDescTooLong : serverErr?.field === "description" ? serverErr.msg : null;
  const canSubmit = !!key && !nameError && !descError && !submitting;

  const openNew = () => {
    setServerErr(null);
    setDialog({ id: null });
  };
  const openEdit = (p: P) => {
    setServerErr(null);
    setEditDraft({ name: p.name, description: p.description ?? "" });
    setDialog({ id: p.id });
  };
  /** Esc / bấm nền / ×: đóng, giữ nháp dự án mới. */
  const dismiss = () => {
    setServerErr(null);
    setDialog(null);
  };
  /** Cancel: bỏ nháp rồi đóng. */
  const cancel = () => {
    if (!editing) setNewDraft(EMPTY);
    dismiss();
  };
  const change = (field: keyof Draft, value: string) => {
    setDraft((d) => ({ ...d, [field]: value }));
    if (serverErr?.field === field) setServerErr(null);
  };

  const save = async () => {
    if (!dialog || !canSubmit || submittingRef.current) return; // chặn bấm / Enter hai lần
    submittingRef.current = true;
    setSubmitting(true);
    const id = dialog.id;
    const body = { name: draft.name.trim(), description: draft.description };
    let invalid = null as ServerErr | null;
    try {
      const p = await run(id ? "Saving" : "Creating project", async () => {
        try {
          // PATCH /api/projects/:id – route tạm của C3 (R-041), client api.ts chưa có hàm riêng.
          return id ? await patch<P>(`/api/projects/${encodeURIComponent(id)}`, body) : await post<P>("/api/projects", body);
        } catch (e) {
          // Lỗi do dữ liệu nhập (trùng tên, quá dài) → hiện dưới đúng ô thay vì toast
          if (e instanceof ApiError && (e.status === 409 || e.status === 400) && !e.code) {
            invalid = { field: e.status === 400 && /description/i.test(e.message) ? "description" : "name", msg: e.message };
            return undefined;
          }
          throw e;
        }
      });
      if (invalid) {
        setServerErr(invalid);
        load(); // cập nhật danh sách để lần sau phát hiện trùng ngay khi gõ
      } else if (p) {
        setDialog(null);
        if (id) {
          toast(`Project ${p.name} updated`, "ok");
          load();
        } else {
          setNewDraft(EMPTY);
          window.location.hash = projectHref(p.id);
        }
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };
  const remove = async (p: P) => {
    const r = await run("Deleting", () => del(`/api/projects/${encodeURIComponent(p.id)}`));
    if (r) toast(`Project ${p.name} deleted`, "ok");
    load();
  };

  return (
    <div className="page" data-testid="home">
      <div className="page-head">
        <div>
          <h1>Projects</h1>
          <p className="muted">Each project has user stories, modules and the flow Documents → Diagrams → Prototype → Test Cases → Traceability.</p>
        </div>
        <Btn kind="primary" onClick={openNew} data-testid="new-project">
          <Icon name="plus" size="sm" />
          New project
        </Btn>
      </div>
      {projects === null ? (
        <div className="muted">Loading…</div>
      ) : projects.length === 0 ? (
        <Empty title="No projects yet">Create your first project to start writing business requirements.</Empty>
      ) : (
        <div className="grid">
          {projects.map((p) => (
            <div key={p.id} className="tile clickable" data-testid="project-tile" onClick={() => (window.location.hash = projectHref(p.id))}>
              <a className="tile-title" href={projectHref(p.id)} title={p.name} onClick={(e) => e.stopPropagation()}>
                {p.name}
              </a>
              <div className="muted small clamp">{p.description?.trim() || "No description"}</div>
              <div className="tile-foot">
                <span>
                  {p.moduleCount} {p.moduleCount === 1 ? "module" : "modules"}
                </span>
                <span>{fmtTime(p.createdAt)}</span>
                <RowActions
                  testId={`project-${p.id}`}
                  onEdit={() => openEdit(p)}
                  onDelete={() => remove(p)}
                  deleteConfirm={{ title: `Delete project "${p.name}"?`, message: "All of the project's modules, user stories, documents, diagrams, screens and tasks will be deleted." }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
      {dialog && (
        <Modal
          title={editing ? "Edit project" : "New project"}
          onClose={dismiss}
          footer={
            <>
              <Btn onClick={cancel} data-testid="cancel-project">
                Cancel
              </Btn>
              <Btn kind="primary" disabled={!canSubmit} onClick={save} data-testid="create-project">
                {editing ? "Save" : "Create project"}
              </Btn>
            </>
          }
        >
          <Field label="Project name" required count={{ value: draft.name.length, max: PROJECT_NAME_MAX }} error={nameError} hint={key ? undefined : "Enter a project name to continue"}>
            <input
              autoFocus
              value={draft.name}
              maxLength={PROJECT_NAME_MAX}
              aria-required="true"
              aria-invalid={!!nameError}
              onChange={(e) => change("name", e.target.value)}
              onKeyDown={(e) => {
                // Enter = bấm nút chính; bỏ qua khi đang gõ bộ gõ (IME, vd tiếng Việt Telex)
                if (e.key !== "Enter" || e.nativeEvent.isComposing || e.keyCode === 229) return;
                e.preventDefault();
                save();
              }}
              placeholder="e.g. Online sales system"
              data-testid="project-name"
            />
          </Field>
          <Field label="Description" count={{ value: draft.description.length, max: PROJECT_DESC_MAX }} error={descError}>
            <textarea
              rows={3}
              value={draft.description}
              maxLength={PROJECT_DESC_MAX}
              aria-invalid={!!descError}
              onChange={(e) => change("description", e.target.value)}
              placeholder="Goals, scope, users…"
              data-testid="project-desc"
            />
          </Field>
        </Modal>
      )}
    </div>
  );
}
