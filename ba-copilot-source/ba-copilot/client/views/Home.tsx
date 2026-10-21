// Trang chủ (đợt 5): danh sách dự án – tạo, sửa, xoá. Bấm vào dự án mở thẳng "Quản lý công việc". Chủ sở hữu: C3.
import React, { useEffect, useState } from "react";
import { del, get, patch, post } from "../api.ts";
import { Btn, Empty, Field, Icon, Modal, RowActions, fmtTime, useUI } from "../components/ui.tsx";
import { projectHref } from "../projectMenu.ts";

interface P {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  moduleCount: number;
}

type Form = { id: string | null; name: string; description: string };

export function Home() {
  const { run, toast } = useUI();
  const [projects, setProjects] = useState<P[] | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const load = () => get<P[]>("/api/projects").then(setProjects).catch((e) => toast(e.message, "err"));
  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    if (!form) return;
    const body = { name: form.name.trim(), description: form.description };
    if (form.id) {
      // PATCH /api/projects/:id – route tạm của C3 (R-041), client api.ts chưa có hàm riêng.
      const id = form.id;
      const p = await run("Saving", () => patch<P>(`/api/projects/${encodeURIComponent(id)}`, body));
      if (!p) return;
      toast(`Project ${p.name} updated`, "ok");
      setForm(null);
      load();
      return;
    }
    const p = await run("Creating project", () => post<P>("/api/projects", body));
    if (p) {
      setForm(null);
      window.location.hash = projectHref(p.id);
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
        <Btn kind="primary" onClick={() => setForm({ id: null, name: "", description: "" })} data-testid="new-project">
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
              <a className="tile-title" href={projectHref(p.id)} onClick={(e) => e.stopPropagation()}>
                {p.name}
              </a>
              <div className="muted small clamp">{p.description || "No description"}</div>
              <div className="tile-foot">
                <span>{p.moduleCount} module</span>
                <span>{fmtTime(p.createdAt)}</span>
                <span className="spacer" />
                <RowActions
                  testId={`project-${p.id}`}
                  onEdit={() => setForm({ id: p.id, name: p.name, description: p.description })}
                  onDelete={() => remove(p)}
                  deleteConfirm={{ title: `Delete project "${p.name}"?`, message: "All of the project's modules, user stories, documents, diagrams, screens and tasks will be deleted." }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
      {form && (
        <Modal
          title={form.id ? "Edit project" : "New project"}
          onClose={() => setForm(null)}
          footer={
            <>
              <Btn onClick={() => setForm(null)}>Cancel</Btn>
              <Btn kind="primary" disabled={!form.name.trim()} onClick={save} data-testid="create-project">
                {form.id ? "Save" : "Create project"}
              </Btn>
            </>
          }
        >
          <Field label="Project name">
            <input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Online sales system" data-testid="project-name" />
          </Field>
          <Field label="Description">
            <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Goals, scope, users…" />
          </Field>
        </Modal>
      )}
    </div>
  );
}
