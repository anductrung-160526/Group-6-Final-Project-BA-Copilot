// SCR-03 Kho tài liệu – trang cấp dự án #/p/:id/files[/:moduleId] (FN-04 → FN-08). Chủ sở hữu: A4.
// Tải lên nhiều tệp kèm thông tin nguồn, bảng tệp xếp theo module, tìm/lọc, đổi tên, xoá có xác nhận.

import React, { useEffect, useMemo, useState } from "react";
import { get, listFiles, uploadFile, updateFile, deleteFile } from "../api.ts";
import type { FileItem } from "../../../shared/types.ts";
import { Badge, Btn, Empty, Field, FileDrop, IconBtn, Modal, RowActions, Select, fmtTime, useUI } from "../components/ui.tsx";
import type { PageProps } from "../routes.ts";
import { withActor } from "../currentMember.ts";
import { ACCEPT, ALLOWED_EXTS, FileDrawer, deleteConfirm, MAX_FILE_BYTES, fmtDay, fmtSize, fold, kindLabel, useDownload } from "./FileDrawer.tsx";

const PROJECT_LEVEL = "__project"; // giá trị lọc "Cấp dự án" (module_id NULL)

interface Mod {
  id: string;
  name: string;
}
interface Source {
  moduleId: string;
  sender: string;
  receivedAt: string;
  note: string;
}

const today = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD theo giờ máy

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(new Error(`Could not read file "${file.name}"`));
    r.readAsDataURL(file);
  });
}

/** Lý do tệp không hợp lệ (loại, kích thước), null nếu hợp lệ. */
function invalidReason(f: File): string | null {
  const dot = f.name.lastIndexOf(".");
  const ext = dot >= 0 ? f.name.slice(dot).toLowerCase() : "";
  if (!ALLOWED_EXTS.includes(ext)) return "only Word, PDF, Excel and images are accepted";
  if (f.size === 0) return "empty file";
  if (f.size > MAX_FILE_BYTES) return "larger than 10 MB";
  return null;
}

/** Các ô thông tin nguồn (FN-05), dùng cho cả hộp thoại tải lên và sửa thông tin. */
function SourceFields({ value, onChange, modules }: { value: Source; onChange: (v: Source) => void; modules: Mod[] }) {
  const set = (k: keyof Source) => (v: string) => onChange({ ...value, [k]: v });
  return (
    <>
      <Field label="Module" hint="Leave blank if the document applies to the whole project">
        <Select value={value.moduleId} onChange={set("moduleId")} placeholder="Project level (no module)" options={modules.map((m) => ({ value: m.id, label: m.name }))} testId="src-module" />
      </Field>
      <Field label="Sent by (stakeholder)">
        <input value={value.sender} onChange={(e) => set("sender")(e.target.value)} placeholder="E.g. Lan – Sales Department" maxLength={200} data-testid="src-sender" />
      </Field>
      <Field label="Received on">
        <input type="date" value={value.receivedAt} onChange={(e) => set("receivedAt")(e.target.value)} data-testid="src-date" />
      </Field>
      <Field label="Notes">
        <textarea rows={3} value={value.note} onChange={(e) => set("note")(e.target.value)} maxLength={2000} placeholder="Key content, version, follow-up actions…" data-testid="src-note" />
      </Field>
    </>
  );
}

export function FilesView({ projectId, params }: PageProps) {
  const { run, toast } = useUI();
  const dl = useDownload();
  const [project, setProject] = useState<{ name: string; modules: Mod[] } | null>(null);
  const [files, setFiles] = useState<FileItem[] | null>(null);
  const [q, setQ] = useState("");
  const [moduleFilter, setModuleFilter] = useState(params[0] ?? "");
  const [pending, setPending] = useState<File[] | null>(null);
  const [source, setSource] = useState<Source>({ moduleId: "", sender: "", receivedAt: today(), note: "" });
  const [viewing, setViewing] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ file: FileItem; name: string; src: Source } | null>(null);

  const load = () =>
    listFiles(projectId)
      .then(setFiles)
      .catch((e) => toast(e.message, "err"));

  useEffect(() => {
    get(`/api/projects/${projectId}`)
      .then((p) => setProject({ name: p.name, modules: (p.modules ?? []).map((m: any) => ({ id: m.id, name: m.name })) }))
      .catch((e) => toast(e.message, "err"));
    load();
  }, [projectId]);
  useEffect(() => setModuleFilter(params[0] ?? ""), [params[0]]);

  const modules = project?.modules ?? [];
  const moduleName = (id: string | null) => (id ? (modules.find((m) => m.id === id)?.name ?? "Deleted module") : "Project level");

  // FN-08: tìm theo tên (không phân biệt dấu) và lọc theo module
  const shown = useMemo(() => {
    const needle = fold(q.trim());
    return (files ?? []).filter(
      (f) =>
        (!moduleFilter || (moduleFilter === PROJECT_LEVEL ? !f.moduleId : f.moduleId === moduleFilter)) &&
        (!needle || fold(f.name).includes(needle)),
    );
  }, [files, q, moduleFilter]);

  // Bảng xếp theo module: cấp dự án trước, rồi các module theo thứ tự trong dự án
  const groups = useMemo(() => {
    const order = [null, ...modules.map((m) => m.id)];
    const extra = shown.map((f) => f.moduleId).filter((id) => !order.includes(id));
    return [...order, ...new Set(extra)]
      .map((id) => ({ id, name: moduleName(id), files: shown.filter((f) => f.moduleId === id) }))
      .filter((g) => g.files.length);
  }, [shown, modules]);

  // ---------------------------------------------------------------- FN-04: tải lên nhiều tệp
  const pick = (list: File[]) => {
    const bad = list.map((f) => [f, invalidReason(f)] as const).filter(([, r]) => r);
    if (bad.length) toast(`Skipped ${bad.map(([f, r]) => `"${f.name}" (${r})`).join(", ")}`, "err");
    const ok = list.filter((f) => !invalidReason(f));
    if (!ok.length) return;
    if (!pending) setSource({ moduleId: moduleFilter && moduleFilter !== PROJECT_LEVEL ? moduleFilter : "", sender: "", receivedAt: today(), note: "" });
    setPending((p) => [...(p ?? []), ...ok]);
  };

  const upload = async () => {
    if (!pending?.length) return;
    const results = await run(`Uploading ${pending.length} ${pending.length === 1 ? "file" : "files"}…`, () =>
      Promise.allSettled(
        pending.map(async (f) =>
          uploadFile(projectId, withActor({
            name: f.name,
            contentBase64: await readBase64(f),
            moduleId: source.moduleId || null,
            sender: source.sender,
            receivedAt: source.receivedAt || null,
            note: source.note,
          })),
        ),
      ),
    );
    if (!results) return;
    const failed = pending.filter((_, i) => results[i].status === "rejected");
    const okCount = pending.length - failed.length;
    if (okCount) toast(`Uploaded ${okCount} ${okCount === 1 ? "file" : "files"}`, "ok");
    results.forEach((r, i) => r.status === "rejected" && toast(`"${pending[i].name}": ${(r.reason as Error).message}`, "err"));
    setPending(failed.length ? failed : null);
    load();
  };

  // ---------------------------------------------------------------- FN-06: đổi tên, sửa thông tin nguồn
  const startEdit = (f: FileItem) =>
    setEditing({ file: f, name: f.name, src: { moduleId: f.moduleId ?? "", sender: f.sender ?? "", receivedAt: f.receivedAt ?? "", note: f.note ?? "" } });

  const saveEdit = async () => {
    if (!editing) return;
    const { file, name, src } = editing;
    if (!name.trim()) return toast("File name cannot be empty", "err");
    const res = await run("Saving…", () =>
      updateFile(file.id, { name, moduleId: src.moduleId || null, sender: src.sender, receivedAt: src.receivedAt || null, note: src.note }),
    );
    if (!res) return;
    toast("File details saved", "ok");
    setEditing(null);
    load();
  };

  // Xoá sau khi RowActions đã hỏi xác nhận.
  const removeFile = async (file: FileItem) => {
    const res = await run("Deleting…", () => deleteFile(file.id));
    if (!res) return;
    toast(`Deleted "${file.name}"`, "ok");
    if (viewing === file.id) setViewing(null);
    load();
  };

  if (!files || !project) return <div className="page muted">Loading…</div>;
  const viewed = viewing ? files.find((f) => f.id === viewing) : null;
  const filtering = !!q.trim() || !!moduleFilter;

  return (
    <div className="page" data-testid="files-view">
      <div className="page-head">
        <div>
          <h1>Document Repository</h1>
          <p className="muted">{files.length} {files.length === 1 ? "file" : "files"} · Documents sent by stakeholders and Word/Excel exports of each module</p>
        </div>
      </div>

      <FileDrop
        onFiles={pick}
        accept={ACCEPT}
        title="Drag and drop documents here (several files at once)"
        hint="or click to browse · Word, PDF, Excel, images · up to 10 MB per file"
        testId="files-drop"
      />

      <div className="filters" style={{ margin: "var(--space-5) 0 var(--space-4)" }}>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by file name…" aria-label="Search by file name" data-testid="files-search" />
        <Select
          value={moduleFilter}
          onChange={setModuleFilter}
          placeholder="All modules"
          options={[{ value: PROJECT_LEVEL, label: "Project level" }, ...modules.map((m) => ({ value: m.id, label: m.name }))]}
          testId="files-module-filter"
        />
      </div>

      {files.length === 0 ? (
        <Empty title="The repository is empty">
          Drag stakeholder documents into the box above, or export Word/Excel from a module's Documents / Test Cases tab – the latest export is saved here automatically.
        </Empty>
      ) : groups.length === 0 ? (
        <Empty title="No matching files">{filtering ? "Try another keyword or select All modules." : null}</Empty>
      ) : (
        groups.map((g) => (
          <section key={g.id ?? PROJECT_LEVEL} id={`files-module-${g.id ?? PROJECT_LEVEL}`} style={{ marginBottom: "var(--space-6)" }}>
            <h2>
              {g.name} <Badge>{g.files.length}</Badge>
            </h2>
            <div className="table-wrap">
              <table className="tbl" data-testid="files-table">
                <thead>
                  <tr>
                    <th>File name</th>
                    <th>Type</th>
                    <th>Sent by</th>
                    <th>Received</th>
                    <th>Size</th>
                    <th>Saved</th>
                    <th className="actions" />
                  </tr>
                </thead>
                <tbody>
                  {g.files.map((f) => (
                    <tr key={f.id} className={`clickable ${viewing === f.id ? "selected" : ""}`} onClick={() => setViewing(f.id)} data-testid={`file-row-${f.id}`}>
                      <td>
                        <button className="link" onClick={(e) => (e.stopPropagation(), setViewing(f.id))}>
                          {f.name}
                        </button>{" "}
                        {f.source === "export" && <Badge tone="violet">Export</Badge>}
                      </td>
                      <td className="nowrap">{kindLabel(f.mime)}</td>
                      <td>{f.sender || <span className="muted">—</span>}</td>
                      <td className="nowrap">{fmtDay(f.receivedAt) || <span className="muted">—</span>}</td>
                      <td className="muted small nowrap">{fmtSize(f.size)}</td>
                      <td className="muted small nowrap">{fmtTime(f.createdAt)}</td>
                      <td className="actions" onClick={(e) => e.stopPropagation()}>
                        <span className="row-actions">
                          <IconBtn icon="download" label="Download" onClick={() => dl(f)} data-testid={`dl-${f.id}`} />
                          <RowActions
                            onEdit={() => startEdit(f)}
                            onDelete={() => removeFile(f)}
                            deleteConfirm={deleteConfirm(f)}
                            testIds={{ edit: `edit-${f.id}`, delete: `del-${f.id}` }}
                          />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}

      {pending && (
        <Modal
          title={`Upload ${pending.length} ${pending.length === 1 ? "file" : "files"}`}
          onClose={() => setPending(null)}
          footer={
            <>
              <Btn onClick={() => setPending(null)}>Cancel</Btn>
              <Btn kind="primary" onClick={upload} disabled={!pending.length} data-testid="confirm-upload">
                Upload
              </Btn>
            </>
          }
        >
          <table className="tbl" data-testid="pending-files">
            <tbody>
              {pending.map((f, i) => (
                <tr key={`${f.name}-${i}`}>
                  <td>{f.name}</td>
                  <td className="muted small nowrap">{fmtSize(f.size)}</td>
                  <td className="right">
                    <IconBtn icon="close" label={`Remove ${f.name}`} onClick={() => setPending((p) => (p && p.length > 1 ? p.filter((_, j) => j !== i) : null))} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <FileDrop onFiles={pick} accept={ACCEPT} title="Add files" hint="drag and drop or click to browse" />
          <p className="muted small">The source details below apply to every file in this upload.</p>
          <SourceFields value={source} onChange={setSource} modules={modules} />
        </Modal>
      )}

      {editing && (
        <Modal
          title="Edit file details"
          onClose={() => setEditing(null)}
          footer={
            <>
              <Btn onClick={() => setEditing(null)}>Cancel</Btn>
              <Btn kind="primary" onClick={saveEdit} data-testid="save-edit">
                Save
              </Btn>
            </>
          }
        >
          <Field label="File name" hint="Keep the file extension; if you remove it, the system adds it back">
            <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} maxLength={150} autoFocus data-testid="edit-name" />
          </Field>
          <SourceFields value={editing.src} onChange={(src) => setEditing({ ...editing, src })} modules={modules} />
        </Modal>
      )}

      {viewed && (
        <FileDrawer
          file={viewed}
          moduleName={moduleName(viewed.moduleId)}
          onClose={() => setViewing(null)}
          onEdit={() => startEdit(viewed)}
          onDelete={() => removeFile(viewed)}
        />
      )}
    </div>
  );
}
