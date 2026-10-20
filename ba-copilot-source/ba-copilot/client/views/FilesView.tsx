// SCR-03 Kho tài liệu – trang cấp dự án #/p/:id/files[/:moduleId] (FN-04 → FN-08). Chủ sở hữu: A4.
// Tải lên nhiều tệp kèm thông tin nguồn, bảng tệp xếp theo module, tìm/lọc, đổi tên, xoá có xác nhận.

import React, { useEffect, useMemo, useState } from "react";
import { get, listFiles, uploadFile, updateFile, deleteFile } from "../api.ts";
import type { FileItem } from "../../shared/types.ts";
import { Badge, Btn, Empty, Field, FileDrop, Modal, Select, fmtTime, useUI } from "../components/ui.tsx";
import type { PageProps } from "../routes.ts";
import { withActor } from "../currentMember.ts";
import { ACCEPT, ALLOWED_EXTS, FileDrawer, MAX_FILE_BYTES, fmtDay, fmtSize, fold, kindLabel, useDownload } from "./FileDrawer.tsx";

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
    r.onerror = () => reject(new Error(`Không đọc được tệp "${file.name}"`));
    r.readAsDataURL(file);
  });
}

/** Lý do tệp không hợp lệ (loại, kích thước), null nếu hợp lệ. */
function invalidReason(f: File): string | null {
  const dot = f.name.lastIndexOf(".");
  const ext = dot >= 0 ? f.name.slice(dot).toLowerCase() : "";
  if (!ALLOWED_EXTS.includes(ext)) return "chỉ nhận Word, PDF, Excel, ảnh";
  if (f.size === 0) return "tệp rỗng";
  if (f.size > MAX_FILE_BYTES) return "quá 10 MB";
  return null;
}

/** Các ô thông tin nguồn (FN-05), dùng cho cả hộp thoại tải lên và sửa thông tin. */
function SourceFields({ value, onChange, modules }: { value: Source; onChange: (v: Source) => void; modules: Mod[] }) {
  const set = (k: keyof Source) => (v: string) => onChange({ ...value, [k]: v });
  return (
    <>
      <Field label="Module" hint="Để trống nếu tài liệu dùng chung cho cả dự án">
        <Select value={value.moduleId} onChange={set("moduleId")} placeholder="Cấp dự án (không thuộc module)" options={modules.map((m) => ({ value: m.id, label: m.name }))} testId="src-module" />
      </Field>
      <Field label="Stakeholder gửi">
        <input value={value.sender} onChange={(e) => set("sender")(e.target.value)} placeholder="Ví dụ: Chị Lan – Phòng Kinh doanh" maxLength={200} data-testid="src-sender" />
      </Field>
      <Field label="Ngày nhận">
        <input type="date" value={value.receivedAt} onChange={(e) => set("receivedAt")(e.target.value)} data-testid="src-date" />
      </Field>
      <Field label="Ghi chú">
        <textarea rows={3} value={value.note} onChange={(e) => set("note")(e.target.value)} maxLength={2000} placeholder="Nội dung chính, phiên bản, việc cần làm…" data-testid="src-note" />
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
  const [deleting, setDeleting] = useState<FileItem | null>(null);

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
  const moduleName = (id: string | null) => (id ? (modules.find((m) => m.id === id)?.name ?? "Module đã xoá") : "Cấp dự án");

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
    if (bad.length) toast(`Bỏ qua ${bad.map(([f, r]) => `"${f.name}" (${r})`).join(", ")}`, "err");
    const ok = list.filter((f) => !invalidReason(f));
    if (!ok.length) return;
    if (!pending) setSource({ moduleId: moduleFilter && moduleFilter !== PROJECT_LEVEL ? moduleFilter : "", sender: "", receivedAt: today(), note: "" });
    setPending((p) => [...(p ?? []), ...ok]);
  };

  const upload = async () => {
    if (!pending?.length) return;
    const results = await run(`Đang tải lên ${pending.length} tệp…`, () =>
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
    if (okCount) toast(`Đã tải lên ${okCount} tệp`, "ok");
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
    if (!name.trim()) return toast("Tên tệp không được để trống", "err");
    const res = await run("Đang lưu…", () =>
      updateFile(file.id, { name, moduleId: src.moduleId || null, sender: src.sender, receivedAt: src.receivedAt || null, note: src.note }),
    );
    if (!res) return;
    toast("Đã lưu thông tin tệp", "ok");
    setEditing(null);
    load();
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const res = await run("Đang xoá…", () => deleteFile(deleting.id));
    if (!res) return;
    toast(`Đã xoá "${deleting.name}"`, "ok");
    if (viewing === deleting.id) setViewing(null);
    setDeleting(null);
    load();
  };

  if (!files || !project) return <div className="page muted">Đang tải…</div>;
  const viewed = viewing ? files.find((f) => f.id === viewing) : null;
  const filtering = !!q.trim() || !!moduleFilter;

  return (
    <div className="page" data-testid="files-view">
      <div className="crumbs">
        <a href="#/">Dự án</a> / <a href={`#/p/${projectId}`}>{project.name}</a> / <span>Kho tài liệu</span>
      </div>
      <div className="page-head">
        <div>
          <h1>Kho tài liệu</h1>
          <p className="muted">{files.length} tệp · Tài liệu stakeholder gửi và bản xuất Word/Excel của từng module</p>
        </div>
      </div>

      <FileDrop
        onFiles={pick}
        accept={ACCEPT}
        title="Kéo thả tài liệu vào đây (nhiều tệp cùng lúc)"
        hint="hoặc bấm để chọn · Word, PDF, Excel, ảnh · tối đa 10 MB mỗi tệp"
        testId="files-drop"
      />

      <div className="filters" style={{ margin: "var(--space-5) 0 var(--space-4)" }}>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo tên tệp…" aria-label="Tìm theo tên tệp" data-testid="files-search" />
        <Select
          value={moduleFilter}
          onChange={setModuleFilter}
          placeholder="Tất cả module"
          options={[{ value: PROJECT_LEVEL, label: "Cấp dự án" }, ...modules.map((m) => ({ value: m.id, label: m.name }))]}
          testId="files-module-filter"
        />
      </div>

      {files.length === 0 ? (
        <Empty title="Kho chưa có tài liệu nào">
          Kéo thả tài liệu stakeholder gửi vào ô phía trên, hoặc xuất Word/Excel ở tab Tài liệu / Test case của module – bản xuất mới nhất tự lưu vào đây.
        </Empty>
      ) : groups.length === 0 ? (
        <Empty title="Không có tệp phù hợp">{filtering ? "Thử từ khoá khác hoặc chọn Tất cả module." : null}</Empty>
      ) : (
        groups.map((g) => (
          <section key={g.id ?? PROJECT_LEVEL} id={`files-module-${g.id ?? PROJECT_LEVEL}`} style={{ marginBottom: "var(--space-6)" }}>
            <h2>
              {g.name} <Badge>{g.files.length}</Badge>
            </h2>
            <table className="tbl" data-testid="files-table">
              <thead>
                <tr>
                  <th>Tên tệp</th>
                  <th>Loại</th>
                  <th>Stakeholder gửi</th>
                  <th>Ngày nhận</th>
                  <th>Kích thước</th>
                  <th>Ngày lưu</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {g.files.map((f) => (
                  <tr key={f.id} className={`clickable ${viewing === f.id ? "selected" : ""}`} onClick={() => setViewing(f.id)} data-testid={`file-row-${f.id}`}>
                    <td>
                      <button className="link" onClick={(e) => (e.stopPropagation(), setViewing(f.id))}>
                        {f.name}
                      </button>{" "}
                      {f.source === "export" && <Badge tone="violet">Bản xuất</Badge>}
                    </td>
                    <td className="nowrap">{kindLabel(f.mime)}</td>
                    <td>{f.sender || <span className="muted">—</span>}</td>
                    <td className="nowrap">{fmtDay(f.receivedAt) || <span className="muted">—</span>}</td>
                    <td className="muted small nowrap">{fmtSize(f.size)}</td>
                    <td className="muted small nowrap">{fmtTime(f.createdAt)}</td>
                    <td className="right nowrap" onClick={(e) => e.stopPropagation()}>
                      <Btn size="sm" onClick={() => dl(f)} data-testid={`dl-${f.id}`}>
                        ⤓ Tải về
                      </Btn>{" "}
                      <Btn size="sm" kind="ghost" onClick={() => startEdit(f)} data-testid={`edit-${f.id}`}>
                        Sửa
                      </Btn>{" "}
                      <Btn size="sm" kind="danger" onClick={() => setDeleting(f)} data-testid={`del-${f.id}`}>
                        Xoá
                      </Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))
      )}

      {pending && (
        <Modal
          title={`Tải lên ${pending.length} tệp`}
          onClose={() => setPending(null)}
          footer={
            <>
              <Btn onClick={() => setPending(null)}>Huỷ</Btn>
              <Btn kind="primary" onClick={upload} disabled={!pending.length} data-testid="confirm-upload">
                Tải lên
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
                    <button className="link-danger" onClick={() => setPending((p) => (p && p.length > 1 ? p.filter((_, j) => j !== i) : null))} aria-label={`Bỏ ${f.name}`}>
                      Bỏ
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <FileDrop onFiles={pick} accept={ACCEPT} title="Thêm tệp" hint="kéo thả hoặc bấm để chọn" />
          <p className="muted small">Thông tin nguồn dưới đây áp dụng cho tất cả tệp trong lần tải lên này.</p>
          <SourceFields value={source} onChange={setSource} modules={modules} />
        </Modal>
      )}

      {editing && (
        <Modal
          title="Sửa thông tin tệp"
          onClose={() => setEditing(null)}
          footer={
            <>
              <Btn onClick={() => setEditing(null)}>Huỷ</Btn>
              <Btn kind="primary" onClick={saveEdit} data-testid="save-edit">
                Lưu
              </Btn>
            </>
          }
        >
          <Field label="Tên tệp" hint="Giữ nguyên đuôi tệp; bỏ đuôi thì hệ thống tự thêm lại">
            <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} maxLength={150} autoFocus data-testid="edit-name" />
          </Field>
          <SourceFields value={editing.src} onChange={(src) => setEditing({ ...editing, src })} modules={modules} />
        </Modal>
      )}

      {deleting && (
        <Modal
          title="Xoá tệp?"
          onClose={() => setDeleting(null)}
          footer={
            <>
              <Btn onClick={() => setDeleting(null)}>Huỷ</Btn>
              <Btn kind="danger" onClick={confirmDelete} data-testid="confirm-delete">
                Xoá tệp
              </Btn>
            </>
          }
        >
          <p>
            Xoá <strong>{deleting.name}</strong> khỏi kho? Tệp bị xoá khỏi máy chủ và không khôi phục được.
          </p>
        </Modal>
      )}

      {viewed && (
        <FileDrawer
          file={viewed}
          moduleName={moduleName(viewed.moduleId)}
          onClose={() => setViewing(null)}
          onEdit={() => startEdit(viewed)}
          onDelete={() => setDeleting(viewed)}
        />
      )}
    </div>
  );
}
