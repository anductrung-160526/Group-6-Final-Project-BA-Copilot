// Bước 2 "Sơ đồ" trong Thực hiện công việc (kế hoạch đợt 5, mục 3 "C6"). Chủ sở hữu: C6. Thay DiagramTab.tsx (giữ tệp cũ).
// Mục con theo loại Context → UC → Sequence → BPMN → ERD (params[0]). Mỗi loại: Sinh bằng AI / Sinh lại (khoá kèm lý do khi
// tài liệu nguồn chưa Xong), sửa mã Mermaid (kiểm tra bằng mermaid.parse trước khi lưu, báo dòng lỗi), xem trước,
// Sequence theo từng UC, thanh Xong / Duyệt / Yêu cầu sửa, "Đang được sửa bởi", báo 409, tải .md.

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  approveArtifact,
  generateModuleDiagram,
  getArtifactState,
  isConflict,
  listModuleDiagrams,
  markArtifactDone,
  requestArtifactChange,
  saveModuleDiagram,
  ApiError,
} from "../api.ts";
import { currentMemberId, useCurrentMember, withActor } from "../currentMember.ts";
import { usePresence } from "../presence.ts";
import { workHref, type WorkStepProps } from "../projectMenu.ts";
import { Mermaid, parseMermaid } from "../components/Mermaid.tsx";
import { ApprovalBar, Badge, Btn, GitOutcome, ConflictNotice, EditingBadge, Empty, Icon, StatusBadge, Tabs, useUI } from "../components/ui.tsx";
import { BPMN_NOTE, checkDiagram, diagramBlockReason, diagramMarkdown, DIAGRAM_FILE, DIAGRAM_HINT, DIAGRAM_SOURCES } from "../../shared/diagrams.ts";
import { DIAGRAM_KINDS, DIAGRAM_KIND_LABEL, type ApprovalResult, type ArtifactStatus, type DiagramKind, type DiagramPart, type DocKind, type ModuleDiagram } from "../../shared/types.ts";

const PREVIEW_DELAY_MS = 400;
const SOURCE_DOCS = [...new Set(Object.values(DIAGRAM_SOURCES).flat())] as DocKind[];

/** Lỗi đang hiện cạnh ô soạn mã: dòng (0 = không rõ) + câu báo; `part` = mã UC khi ở Sequence. */
interface Issue {
  line: number;
  message: string;
  part?: string;
}

const toKind = (s: string | undefined): DiagramKind => {
  const k = String(s ?? "").toUpperCase() as DiagramKind;
  return DIAGRAM_KINDS.includes(k) ? k : "CONTEXT";
};

export function DiagramsView({ projectId, moduleId, params }: WorkStepProps) {
  const kind = toKind(params[0]);
  const { run, toast, confirm } = useUI();
  const { me } = useCurrentMember();
  const isLead = me?.role === "BA_LEAD";
  const others = usePresence("diagram", moduleId, kind);

  const [all, setAll] = useState<ModuleDiagram[] | null>(null);
  const [docStatus, setDocStatus] = useState<Partial<Record<DocKind, ArtifactStatus>>>({});
  const [code, setCode] = useState("");
  const [parts, setParts] = useState<DiagramPart[]>([]);
  const [partKey, setPartKey] = useState("");
  const [preview, setPreview] = useState("");
  const [issue, setIssue] = useState<Issue | null>(null);
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const editor = useRef<HTMLTextAreaElement>(null);

  const d = all?.find((x) => x.kind === kind) ?? null;
  const isSeq = kind === "SEQUENCE";
  const part = parts.find((p) => p.key === partKey) ?? parts[0] ?? null;
  const text = isSeq ? (part?.code ?? "") : code;
  const dirty = !!d && (isSeq ? JSON.stringify(parts) !== JSON.stringify(d.parts) : code !== d.code);
  const blockReason = diagramBlockReason(kind, (k) => docStatus[k] ?? "none");
  const exists = !!d && d.status !== "none";

  const applyDiagram = (x: ModuleDiagram | null) => {
    setCode(x?.code ?? "");
    setParts(x?.parts ?? []);
    setPartKey((k) => (x?.parts.some((p) => p.key === k) ? k : (x?.parts[0]?.key ?? "")));
    setIssue(null);
  };

  const reload = useCallback(async () => {
    try {
      const [list, states] = await Promise.all([
        listModuleDiagrams(moduleId),
        Promise.all(SOURCE_DOCS.map((k) => getArtifactState("doc", moduleId, k).catch(() => null))),
      ]);
      setAll(list);
      setDocStatus(Object.fromEntries(SOURCE_DOCS.map((k, i) => [k, states[i]?.status ?? "none"])));
      setConflict(false);
      return list;
    } catch (e) {
      toast((e as Error).message, "err");
      return null;
    }
  }, [moduleId, toast]);

  useEffect(() => {
    setAll(null);
    reload();
  }, [reload]);

  // Đổi loại sơ đồ hoặc tải lại → nạp mã của loại đang chọn
  useEffect(() => {
    applyDiagram(all?.find((x) => x.kind === kind) ?? null);
  }, [all, kind]);

  useEffect(() => {
    const t = setTimeout(() => setPreview(text), PREVIEW_DELAY_MS);
    return () => clearTimeout(t);
  }, [text]);

  const setText = (v: string) => {
    setIssue(null);
    if (!isSeq) return setCode(v);
    setParts((ps) => ps.map((p) => (p.key === part?.key ? { ...p, code: v } : p)));
  };

  /** Chạy lệnh ghi; 409 → hiện ConflictNotice thay vì toast. */
  const write = async <T,>(label: string, fn: () => Promise<T>): Promise<T | undefined> =>
    run(label, async () => {
      try {
        return await fn();
      } catch (e) {
        if (isConflict(e)) {
          setConflict(true);
          return undefined;
        }
        throw e;
      }
    });

  const afterWrite = (x: ModuleDiagram) => {
    setAll((list) => (list ?? []).map((y) => (y.kind === x.kind ? x : y)));
  };

  const generate = async () => {
    if (!d) return;
    if (exists && !(await confirm({ title: `Sinh lại sơ đồ ${DIAGRAM_KIND_LABEL[kind]}?`, message: dirty ? "Mã đang sửa chưa lưu sẽ bị thay." : "Sơ đồ hiện có sẽ bị thay bằng bản AI mới.", okLabel: "Sinh lại" }))) return;
    const x = await write(`AI đang vẽ sơ đồ ${DIAGRAM_KIND_LABEL[kind]}…`, () => generateModuleDiagram(moduleId, kind, withActor({ baseRev: d.rev })));
    if (x) {
      afterWrite(x);
      toast(`Đã sinh sơ đồ ${DIAGRAM_KIND_LABEL[kind]}`, "ok");
    }
  };

  /** Kiểm tra bằng Mermaid thật, rồi bằng luật loại sơ đồ (shared/diagrams.ts). Trả lỗi đầu tiên. */
  const validate = async (): Promise<Issue | null> => {
    const list = isSeq ? parts.map((p) => ({ key: p.key, code: p.code })) : [{ key: "", code }];
    for (const p of list) {
      const e = await parseMermaid(p.code);
      if (e) return { line: e.line, message: e.message, part: p.key || undefined };
    }
    const errs = checkDiagram(kind, { code, parts });
    if (!errs.length) return null;
    const m = errs[0].match(/^(?:(\S+) – )?Dòng (\d+): (.*)$/);
    return m ? { line: Number(m[2]), message: m[3], part: m[1] } : { line: 0, message: errs[0] };
  };

  const goToLine = (i: Issue) => {
    if (i.part) setPartKey(i.part);
    setTimeout(() => {
      const ta = editor.current;
      if (!ta || !i.line) return;
      const lines = ta.value.split("\n");
      const start = lines.slice(0, i.line - 1).reduce((n, l) => n + l.length + 1, 0);
      ta.focus();
      ta.setSelectionRange(start, start + (lines[i.line - 1]?.length ?? 0));
    }, 0);
  };

  const save = async () => {
    if (!d) return;
    let bad: Issue | null;
    try {
      bad = await validate();
    } catch (e) {
      return toast((e as Error).message, "err");
    }
    if (bad) {
      setIssue(bad);
      goToLine(bad);
      return toast(`Mã Mermaid sai${bad.line ? ` ở dòng ${bad.line}` : ""} – chưa lưu`, "err");
    }
    const x = await write("Đang lưu sơ đồ", async () => {
      try {
        return await saveModuleDiagram(moduleId, kind, withActor({ code: isSeq ? "" : code, ...(isSeq ? { parts } : {}), baseRev: d.rev }));
      } catch (e) {
        if (e instanceof ApiError && e.status === 400 && e.details?.length) setIssue({ line: 0, message: e.details[0] });
        throw e;
      }
    });
    if (x) {
      afterWrite(x);
      toast(d.status === "done" || d.status === "approved" ? "Đã lưu – sơ đồ trở về Đang làm, cần bấm Xong lại" : "Đã lưu sơ đồ", "ok");
    }
  };

  const approval = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      const r = (await fn()) as ApprovalResult | undefined;
      if (r?.git) toast(<GitOutcome git={r.git} />, r.git.pushed ? "ok" : "info");
      else toast(label, "ok");
    } catch (e) {
      if (isConflict(e)) setConflict(true);
      else toast((e as Error).message, "err");
    } finally {
      setBusy(false);
      reload();
    }
  };
  const ref = () => ({ sub: kind, baseRev: d?.rev, actorId: currentMemberId() });

  const downloadMd = () => {
    const blob = new Blob([diagramMarkdown({ kind, code: isSeq ? "" : code, parts })], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = DIAGRAM_FILE[kind];
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const statusOf = (k: DiagramKind): ArtifactStatus => all?.find((x) => x.kind === k)?.status ?? "none";

  return (
    <div className="page" data-testid="diagrams-view">
      <div className="page-head">
        <h1>Sơ đồ</h1>
        <EditingBadge names={others.map((o) => o.name)} />
      </div>
      <Tabs
        active={kind}
        items={DIAGRAM_KINDS.map((k) => ({
          key: k,
          label: DIAGRAM_KIND_LABEL[k],
          extra: <StatusBadge status={statusOf(k)} />,
          href: workHref(projectId, moduleId, "diagrams", k),
          testId: `diagram-tab-${k}`,
        }))}
      />

      {!all || !d ? null : (
        <div className="doc-main">
          <ApprovalBar
            status={d.status}
            revisionRequested={d.revisionRequested}
            isLead={isLead}
            busy={busy}
            disabledReason={dirty ? "Lưu mã trước khi bấm Xong" : undefined}
            onDone={() => approval("Đã đánh dấu Xong", () => markArtifactDone("diagram", moduleId, ref()))}
            onApprove={() => approval("Đã duyệt sơ đồ", () => approveArtifact("diagram", moduleId, ref()))}
            onRequestChange={() => approval("Đã yêu cầu sửa", () => requestArtifactChange("diagram", moduleId, { sub: kind, actorId: currentMemberId() }))}
          />
          {conflict && <ConflictNotice onReload={reload} />}
          {d.status === "outdated" && (
            <div className="notice notice-warn">
              <span className="notice-text">Tài liệu nguồn đã thay đổi sau khi vẽ sơ đồ này. Hãy sinh lại hoặc sửa mã cho khớp.</span>
            </div>
          )}

          <div className="toolbar">
            <span className="muted small">{DIAGRAM_HINT[kind]}</span>
            {kind === "BPMN" && <Badge>{BPMN_NOTE}</Badge>}
            <div className="spacer" />
            {blockReason && <span className="muted small" data-testid="generate-reason">{blockReason}</span>}
            <Btn kind={exists ? "secondary" : "primary"} size="sm" disabled={!!blockReason} title={blockReason ?? ""} onClick={generate} data-testid="generate-diagram">
              <Icon name={blockReason ? "lock" : "ai"} size="sm" />
              {exists ? "Sinh lại" : "Sinh bằng AI"}
            </Btn>
            {exists && (
              <>
                <Btn kind={dirty ? "primary" : "secondary"} size="sm" disabled={!dirty} onClick={save} data-testid="save-diagram">
                  Lưu mã
                </Btn>
                <Btn kind="ghost" size="sm" onClick={downloadMd} data-testid="download-md">
                  <Icon name="download" size="sm" />
                  Tải .md
                </Btn>
              </>
            )}
          </div>

          {!exists ? (
            <Empty title={blockReason ? "Chưa sinh được sơ đồ" : `Sẵn sàng sinh sơ đồ ${DIAGRAM_KIND_LABEL[kind]}`}>
              {blockReason ? `${blockReason}. Mở bước Tài liệu để hoàn thành rồi quay lại.` : 'Bấm "Sinh bằng AI" để tạo sơ đồ, sau đó có thể sửa mã và bấm Xong.'}
            </Empty>
          ) : (
            (() => {
              const editorBox = (
                <div className="box">
                  <div className="box-title">Mã Mermaid{isSeq && part ? ` – ${part.title}` : ""}</div>
                  {issue && (!issue.part || issue.part === part?.key) && (
                    <div className="notice notice-warn" role="alert" data-testid="mermaid-issue">
                      <span className="notice-text">{issue.line ? `Dòng ${issue.line}: ${issue.message}` : issue.message}</span>
                      {issue.line > 0 && (
                        <Btn size="sm" onClick={() => goToLine(issue)}>
                          Tới dòng {issue.line}
                        </Btn>
                      )}
                    </div>
                  )}
                  <textarea ref={editor} value={text} onChange={(e) => setText(e.target.value)} rows={isSeq ? 14 : 24} spellCheck={false} aria-label="Mã Mermaid của sơ đồ" data-testid="diagram-code" />
                  {dirty && <span className="muted small">Có thay đổi chưa lưu</span>}
                </div>
              );
              const previewBox = (
                <div className="box">
                  <div className="box-title">Xem trước</div>
                  {preview.trim() ? <Mermaid code={preview} name={isSeq ? `sequence-${part?.key ?? ""}` : `so-do-${kind.toLowerCase()}`} /> : <Empty title="Chưa có mã để vẽ" />}
                </div>
              );
              if (!isSeq)
                return (
                  <div className="split-2">
                    {editorBox}
                    {previewBox}
                  </div>
                );
              return (
                <div className="doc-layout">
                  <nav className="doc-nav" aria-label="Sơ đồ tuần tự theo Use Case" data-testid="sequence-parts">
                    {parts.map((p) => (
                      <button key={p.key} type="button" className={p.key === part?.key ? "on" : ""} onClick={() => setPartKey(p.key)}>
                        <span className="code-tag">{p.key}</span> {p.title.replace(`${p.key} – `, "")}
                      </button>
                    ))}
                  </nav>
                  <div className="doc-main">
                    {editorBox}
                    {previewBox}
                  </div>
                </div>
              );
            })()
          )}
        </div>
      )}
    </div>
  );
}
