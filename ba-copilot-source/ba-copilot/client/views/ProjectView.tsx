import React, { useEffect, useMemo, useState } from "react";
import { get, post, del } from "../api.ts";
import { Btn, Empty, Field, Modal, ScoreBadge, StatusBadge, useUI } from "../components/ui.tsx";
import { QusPanel } from "../components/QusPanel.tsx";

const SAMPLE = `- As a customer, I want to sign in with my email and password, so that I can shop faster.
- As a customer, I want to register a new account.
- Allow administrators to manage products (search, add, edit, delete).`;

export function ProjectView({ id, tab, initialModuleId }: { id: string; tab: string; initialModuleId?: string | null }) {
  const { run, toast, confirm } = useUI();
  const [data, setData] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [req, setReq] = useState("");
  const load = () => get(`/api/projects/${id}`).then(setData).catch((e) => toast(e.message, "err"));
  // Story của các module có sẵn trong dự án, để QUS bắt trùng chéo module
  const otherStories = useMemo(
    () => (data?.modules ?? []).map((x: any) => ({ moduleName: x.name, text: x.requirementInput ?? "" })),
    [data],
  );
  useEffect(() => {
    load();
  }, [id]);

  const create = async () => {
    const m = await run("Creating module", () => post(`/api/projects/${id}/modules`, { name, requirementInput: req }));
    if (m) window.location.hash = `#/m/${m.id}/design`;
  };

  if (!data) return <div className="page muted">Loading…</div>;
  return (
    <div className="page">
      <div className="crumbs">
        <a href="#/">Projects</a> / <span>{data.name}</span>
      </div>
      <div className="page-head">
        <div>
          <h1>{data.name}</h1>
          <p className="muted">{data.description?.trim() || "No description"}</p>
        </div>
        {tab === "modules" && (
          <Btn kind="primary" onClick={() => setOpen(true)} data-testid="new-module">
            + New module
          </Btn>
        )}
      </div>

      {/* Tab nav cấp dự án */}
      <nav className="tabs" role="tablist" style={{ marginBottom: 20 }}>
        <a
          href={`#/p/${id}/modules`}
          role="tab"
          aria-selected={tab === "modules"}
          className={`tab ${tab === "modules" ? "active" : ""}`}
          data-testid="tab-modules"
        >
          Module ({data.modules?.length ?? 0})
        </a>
        <a
          href={`#/p/${id}/files`}
          role="tab"
          aria-selected={tab === "files"}
          className={`tab ${tab === "files" ? "active" : ""}`}
          data-testid="tab-files"
        >
          📁 Document Repository
        </a>
      </nav>

      {/* Tab "Kho tài liệu" (#/p/:id/files) mở FilesView qua client/routes.ts */}
      {data.modules.length === 0 ? (
        <Empty title="No modules yet">A module is a group of features (e.g. Authentication, Product management). Create a module, then prompt the AI to design its screens.</Empty>
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Module</th>
                <th>Quality</th>
                <th>Screens</th>
                <th>Documents</th>
                <th>Test case</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.modules.map((m: any) => (
                <tr key={m.id}>
                  <td>
                    <a href={`#/m/${m.id}/design`} className="strong">
                      {m.name}
                    </a>
                  </td>
                  <td>{m.qusScore == null ? <span className="muted small">Not scored</span> : <ScoreBadge score={m.qusScore} />}</td>
                  <td>{m.screenCount}</td>
                  <td>
                    <StatusBadge status={m.docsStatus} />
                  </td>
                  <td>
                    <StatusBadge status={m.testsStatus} />
                  </td>
                  <td className="right">
                    <button
                      className="link-danger"
                      onClick={async () => {
                        if (!(await confirm({ title: `Delete module "${m.name}"?`, message: "The module's screens, documents and test cases will be deleted.", okLabel: "Delete", danger: true }))) return;
                        await run("Deleting", () => del(`/api/modules/${m.id}`));
                        load();
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <Modal
          title="New module"
          wide
          onClose={() => setOpen(false)}
          footer={
            <>
              <Btn onClick={() => setOpen(false)}>Cancel</Btn>
              <Btn kind="primary" disabled={!name.trim()} onClick={create} data-testid="create-module">
                Create module
              </Btn>
            </>
          }
        >
          <Field label="Module name">
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. User authentication" />
          </Field>
          <Field label="Business requirements / User stories (optional)" hint="Paste user stories or a free-form feature list. The AI uses it as context when designing and writing documents.">
            <textarea rows={7} value={req} onChange={(e) => setReq(e.target.value)} placeholder={SAMPLE} />
          </Field>
          <button className="link" onClick={() => setReq(SAMPLE)}>
            Use a sample
          </button>
          {/* SCR-15 đặt ngoài <Field> (thẻ label) để bấm bung/thu story không nhảy con trỏ về ô nhập */}
          <QusPanel text={req} others={otherStories} />
        </Modal>
      )}
    </div>
  );
}

