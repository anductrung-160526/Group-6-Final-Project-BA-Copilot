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
      const p = await run("Đang lưu", () => patch<P>(`/api/projects/${encodeURIComponent(id)}`, body));
      if (!p) return;
      toast(`Đã cập nhật dự án ${p.name}`, "ok");
      setForm(null);
      load();
      return;
    }
    const p = await run("Đang tạo dự án", () => post<P>("/api/projects", body));
    if (p) {
      setForm(null);
      window.location.hash = projectHref(p.id);
    }
  };
  const remove = async (p: P) => {
    const r = await run("Đang xoá", () => del(`/api/projects/${encodeURIComponent(p.id)}`));
    if (r) toast(`Đã xoá dự án ${p.name}`, "ok");
    load();
  };

  return (
    <div className="page" data-testid="home">
      <div className="page-head">
        <div>
          <h1>Dự án</h1>
          <p className="muted">Mỗi dự án có user story, các module và luồng Tài liệu → Sơ đồ → Prototype → Test case → Truy vết.</p>
        </div>
        <Btn kind="primary" onClick={() => setForm({ id: null, name: "", description: "" })} data-testid="new-project">
          <Icon name="plus" size="sm" />
          Dự án mới
        </Btn>
      </div>
      {projects === null ? (
        <div className="muted">Đang tải…</div>
      ) : projects.length === 0 ? (
        <Empty title="Chưa có dự án nào">Tạo dự án đầu tiên để bắt đầu viết yêu cầu nghiệp vụ.</Empty>
      ) : (
        <div className="grid">
          {projects.map((p) => (
            <div key={p.id} className="tile clickable" data-testid="project-tile" onClick={() => (window.location.hash = projectHref(p.id))}>
              <a className="tile-title" href={projectHref(p.id)} onClick={(e) => e.stopPropagation()}>
                {p.name}
              </a>
              <div className="muted small clamp">{p.description || "Không có mô tả"}</div>
              <div className="tile-foot">
                <span>{p.moduleCount} module</span>
                <span>{fmtTime(p.createdAt)}</span>
                <span className="spacer" />
                <RowActions
                  testId={`project-${p.id}`}
                  onEdit={() => setForm({ id: p.id, name: p.name, description: p.description })}
                  onDelete={() => remove(p)}
                  deleteConfirm={{ title: `Xoá dự án "${p.name}"?`, message: "Toàn bộ module, user story, tài liệu, sơ đồ, màn hình và công việc của dự án sẽ bị xoá." }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
      {form && (
        <Modal
          title={form.id ? "Sửa dự án" : "Dự án mới"}
          onClose={() => setForm(null)}
          footer={
            <>
              <Btn onClick={() => setForm(null)}>Huỷ</Btn>
              <Btn kind="primary" disabled={!form.name.trim()} onClick={save} data-testid="create-project">
                {form.id ? "Lưu" : "Tạo dự án"}
              </Btn>
            </>
          }
        >
          <Field label="Tên dự án">
            <input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="VD: Hệ thống bán hàng online" data-testid="project-name" />
          </Field>
          <Field label="Mô tả">
            <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Mục tiêu, phạm vi, người dùng…" />
          </Field>
        </Modal>
      )}
    </div>
  );
}
