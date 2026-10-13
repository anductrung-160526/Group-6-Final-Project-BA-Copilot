import React, { useEffect, useState } from "react";
import { get, post, del } from "../api.ts";
import { Btn, Empty, Field, Modal, fmtTime, useUI } from "../components/ui.tsx";

interface P {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  moduleCount: number;
}

export function Home() {
  const { run, toast } = useUI();
  const [projects, setProjects] = useState<P[] | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const load = () => get<P[]>("/api/projects").then(setProjects).catch((e) => toast(e.message, "err"));
  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    const p = await run("Đang tạo dự án", () => post("/api/projects", { name, description: desc }));
    if (p) {
      setOpen(false);
      setName("");
      setDesc("");
      window.location.hash = `#/p/${p.id}`;
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Dự án</h1>
          <p className="muted">Mỗi dự án gồm nhiều module. Mỗi module đi qua 4 bước: Thiết kế → Tài liệu → Test case → Truy vết.</p>
        </div>
        <Btn kind="primary" onClick={() => setOpen(true)} data-testid="new-project">
          + Dự án mới
        </Btn>
      </div>
      {projects === null ? (
        <div className="muted">Đang tải…</div>
      ) : projects.length === 0 ? (
        <Empty title="Chưa có dự án nào">Tạo dự án đầu tiên để bắt đầu thiết kế module.</Empty>
      ) : (
        <div className="grid">
          {projects.map((p) => (
            <a key={p.id} className="tile" href={`#/p/${p.id}`}>
              <div className="tile-title">{p.name}</div>
              <div className="muted small clamp">{p.description || "Không có mô tả"}</div>
              <div className="tile-foot">
                <span>{p.moduleCount} module</span>
                <span>{fmtTime(p.createdAt)}</span>
                <button
                  className="link-danger"
                  onClick={async (e) => {
                    e.preventDefault();
                    if (!confirm(`Xóa dự án "${p.name}" và toàn bộ dữ liệu?`)) return;
                    await run("Đang xóa", () => del(`/api/projects/${p.id}`));
                    load();
                  }}
                >
                  Xóa
                </button>
              </div>
            </a>
          ))}
        </div>
      )}
      {open && (
        <Modal
          title="Dự án mới"
          onClose={() => setOpen(false)}
          footer={
            <>
              <Btn onClick={() => setOpen(false)}>Hủy</Btn>
              <Btn kind="primary" disabled={!name.trim()} onClick={create} data-testid="create-project">
                Tạo dự án
              </Btn>
            </>
          }
        >
          <Field label="Tên dự án">
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Hệ thống bán hàng online" />
          </Field>
          <Field label="Mô tả">
            <textarea rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Mục tiêu, phạm vi, người dùng…" />
          </Field>
        </Modal>
      )}
    </div>
  );
}
