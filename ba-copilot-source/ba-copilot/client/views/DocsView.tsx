// Màn Tài liệu – bước 1 của "Thực hiện công việc" (#/p/:pid/work/:moduleId/docs/<DocKind>). Chủ sở hữu: C5.
// 5 bước BRD → UC Specification → SRS → FRD-NFR → API Spec (kế hoạch đợt 5, quyết định 6–8). Mỗi bước: Sinh bằng AI /
// Sinh lại (khoá khi bước trước chưa Xong), xem Markdown, Sửa tay (lưu kèm baseRev), Chỉnh bằng AI theo mục,
// ApprovalBar (Xong / Duyệt / Yêu cầu sửa), "Đang được sửa bởi …", báo 409, tải .md.
// API: docs/api.md "Đợt 5" mục 5.3 (C5) và 5.5 (C7). Giao diện chỉ dùng component trong components/ui.tsx.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  approveArtifact,
  generateModuleDoc,
  isConflict,
  listModuleDocs,
  listStories,
  markArtifactDone,
  refineModuleDoc,
  requestArtifactChange,
  saveModuleDoc,
  withApprovalState,
} from "../api.ts";
import { DOC_KINDS, DOC_KIND_LABEL } from "../../shared/types.ts";
import type { ApprovalResult, DocKind, ModuleDoc } from "../../shared/types.ts";
import { doneBlockReason } from "../../shared/prereq.ts";
import { SampleBadge, ApprovalBar, Btn, GitOutcome, ConflictNotice, EditingBadge, Empty, Field, Icon, Modal, RevisionTag, Select, StatusBadge, Tabs, fmtTime, useUI } from "../components/ui.tsx";
import { Markdown } from "../components/Markdown.tsx";
import { currentMemberId, useCurrentMember, withActor } from "../currentMember.ts";
import { usePresence } from "../presence.ts";
// Chỉ import kiểu từ projectMenu.ts (projectMenu import màn này – tránh vòng import lúc chạy).
import type { WorkStepProps } from "../projectMenu.ts";

/** Cùng dạng workHref() trong projectMenu.ts: #/p/:pid/work/:moduleId/docs/<DocKind>. */
const stepHref = (projectId: string, moduleId: string, kind: DocKind) => `#/p/${encodeURIComponent(projectId)}/work/${encodeURIComponent(moduleId)}/docs/${kind}`;
const isDocKind = (k: unknown): k is DocKind => typeof k === "string" && (DOC_KINDS as string[]).includes(k);
const READY = (s: string) => s === "done" || s === "approved";

/** Nguồn đầu vào của từng bước (hiện ở trạng thái rỗng). */
const SOURCE: Record<DocKind, string> = {
  BRD: "The AI writes the BRD from the module's user stories (Business Requirements).",
  UC_SPEC: "The AI writes the use case specifications from the BRD and user stories.",
  SRS: "The AI writes the SRS from the UC Specification.",
  FRD_NFR: "The AI derives the functional (FR) and non-functional (NFR) requirements from the SRS and use cases.",
  API_SPEC: "The AI writes the API specification (endpoints, request/response, error codes) from the FRD-NFR and use cases.",
};

/** Tên tệp tải về, theo bố cục GitHub của kế hoạch (01-BRD.md … 05-API-Spec.md). */
const fileName = (kind: DocKind) => `${String(DOC_KINDS.indexOf(kind) + 1).padStart(2, "0")}-${DOC_KIND_LABEL[kind].replace(/\s+/g, "-")}.md`;

/** Markdown để xem: bỏ tiêu đề "# …" đầu (tiêu đề đã có trên trang), "# " còn lại hạ thành "## ". */
const viewText = (md: string) => md.replace(/^\s*# .*(\r?\n)?/, "").replace(/^# /gm, "## ");
const sectionTitles = (md: string) => {
  const out: string[] = [];
  let fence = false;
  for (const line of md.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) fence = !fence;
    const m = !fence && /^## (.+)$/.exec(line);
    if (m) out.push(m[1].trim());
  }
  return out;
};

function downloadMd(kind: DocKind, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/markdown;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName(kind);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function DocsView({ projectId, moduleId, params }: WorkStepProps) {
  const kind: DocKind = isDocKind(params[0]) ? params[0] : "BRD";
  const label = DOC_KIND_LABEL[kind];
  const idx = DOC_KINDS.indexOf(kind);
  const { run, toast, confirm } = useUI();
  const { me, members } = useCurrentMember();
  const isLead = me?.role === "BA_LEAD";
  const others = usePresence("doc", moduleId, kind);

  const [list, setList] = useState<ModuleDoc[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [storyCount, setStoryCount] = useState<number | null>(null);
  const [conflict, setConflict] = useState(false);
  const [draft, setDraft] = useState<string | null>(null); // đang sửa tay
  const [draftRev, setDraftRev] = useState(0);
  const [refining, setRefining] = useState(false);
  const [section, setSection] = useState("");
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setList(await listModuleDocs(moduleId));
      setLoadError("");
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, [moduleId]);

  useEffect(() => {
    setList(null);
    load();
    // Story của C4: chưa có API (501) thì không biết số story – server vẫn tự chặn khi sinh BRD.
    listStories(projectId, { moduleId })
      .then((s) => setStoryCount(s.filter((x) => x.iWant.trim() || x.asA.trim()).length))
      .catch(() => setStoryCount(null));
  }, [projectId, moduleId, load]);

  useEffect(() => {
    setDraft(null);
    setConflict(false);
    setRefining(false);
    setSection("");
  }, [kind, moduleId]);

  const doc = list?.find((d) => d.kind === kind) ?? null;
  const prev = idx > 0 ? (list?.find((d) => d.kind === DOC_KINDS[idx - 1]) ?? null) : null;
  const titles = useMemo(() => sectionTitles(doc?.content ?? ""), [doc?.content]);

  const lockReason =
    idx === 0
      ? storyCount === 0
        ? "This module has no user stories yet – add them under Business Requirements first."
        : ""
      : prev && !READY(prev.status)
        ? `The previous step (${DOC_KIND_LABEL[prev.kind]}) is not Done.`
        : "";

  /** Chạy thao tác ghi: lỗi 409 → hiện ConflictNotice; lỗi khác → toast (qua run). */
  const guard = <T,>(text: string, fn: () => Promise<T>) =>
    run(text, async () => {
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

  const reload = async () => {
    setConflict(false);
    setDraft(null);
    await load();
  };

  if (loadError) return <div className="page"><Empty title="Could not load the documents">{loadError}</Empty></div>;
  if (!list || !doc) return <div className="page"><div className="muted">Loading…</div></div>;

  const has = doc.status !== "none";
  const who = doc.updatedBy ? (members.find((m) => m.id === doc.updatedBy)?.name ?? "") : "";
  // Nút Xong khoá khi bước trước chưa Xong (cùng luật với nút Sinh – shared/prereq.ts); server cũng chặn.
  const doneLock =
    doc.status === "draft" || doc.status === "outdated"
      ? (doneBlockReason({ kind: "doc", sub: kind }, { docStatus: (k) => list.find((x) => x.kind === k)?.status, storyCount: storyCount ?? undefined }) ?? undefined)
      : undefined;

  const generate = async () => {
    if (
      has &&
      !(await confirm({
        title: `Regenerate ${label}?`,
        message: `The current content will be replaced by a new AI version. Later steps that already exist will become Outdated.`,
        okLabel: "Regenerate",
      }))
    )
      return;
    const r = await guard(`AI is writing ${label}…`, () => generateModuleDoc(moduleId, kind, withActor({ baseRev: doc.rev })));
    if (r) {
      toast(`${label} generated`, "ok");
      await load();
    }
  };

  const saveDraft = async () => {
    if (draft === null) return;
    if (!draft.trim()) return toast("Content cannot be empty", "err");
    const r = await guard("Saving…", () => saveModuleDoc(moduleId, kind, withActor({ content: draft, baseRev: draftRev })));
    if (r) {
      setDraft(null);
      toast(`${label} saved`, "ok");
      await load();
    }
  };

  const refine = async () => {
    if (!instruction.trim()) return toast("Enter a refinement instruction", "err");
    const r = await guard(`AI is refining ${label}…`, () =>
      refineModuleDoc(moduleId, kind, withActor({ instruction: instruction.trim(), ...(section ? { section } : {}), baseRev: doc.rev })),
    );
    setRefining(false);
    if (r) {
      setInstruction("");
      toast(section ? `Section "${section}" refined` : `${label} refined`, "ok");
      await load();
    }
  };

  const flow = async (text: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      const r = await guard(text, fn);
      const st = (r as ApprovalResult | undefined)?.state;
      if (st) setList((l) => l?.map((d) => (d.kind === kind ? withApprovalState(d, st) : d)) ?? l); // rev mới ngay, trước khi tải lại
      const git = (r as ApprovalResult | undefined)?.git;
      if (git) toast(<GitOutcome git={git} />, git.pushed ? "ok" : "info");
      else if (r) toast(ok, "ok");
      await load();
    } finally {
      setBusy(false);
    }
  };
  const actorBody = { sub: kind, actorId: currentMemberId() };

  return (
    <div className="page" data-testid="docs-view">
      <div className="page-head">
        <div>
          <div className="crumbs">Deliverables · Documents · Step {idx + 1}/{DOC_KINDS.length}</div>
          <h1>{label}</h1>
          {has && (
            <div className="muted small" data-testid="doc-meta">
              Version {doc.rev}
              {doc.updatedAt ? ` · updated ${fmtTime(doc.updatedAt)}` : ""}
              {who ? ` by ${who}` : ""}
            </div>
          )}
        </div>
        <div className="refine-row">
          <EditingBadge names={others.map((o) => o.name)} />
          {lockReason && (
            <span className="muted small" data-testid="doc-lock-reason">
              <Icon name="lock" size="sm" /> {lockReason}
            </span>
          )}
          <SampleBadge />
          <Btn kind={has ? "secondary" : "primary"} onClick={generate} disabled={!!lockReason || draft !== null} title={lockReason} data-testid="doc-generate">
            <Icon name={has ? "regenerate" : "ai"} size="sm" />
            {has ? "Regenerate" : "Generate with AI"}
          </Btn>
          {has && (
            <>
              <Btn
                onClick={() => {
                  setDraft(doc.content);
                  setDraftRev(doc.rev);
                  setConflict(false);
                }}
                disabled={draft !== null}
                data-testid="doc-edit"
              >
                <Icon name="edit" size="sm" />
                Edit
              </Btn>
              <Btn onClick={() => setRefining(true)} disabled={draft !== null} data-testid="doc-refine">
                <Icon name="ai" size="sm" />
                Refine with AI
              </Btn>
              <Btn kind="ghost" onClick={() => downloadMd(kind, doc.content)} data-testid="doc-download">
                <Icon name="download" size="sm" />
                Download .md
              </Btn>
            </>
          )}
        </div>
      </div>

      <div className="doc-main">
        <Tabs
          active={kind}
          items={DOC_KINDS.map((k, i) => {
            const d = list.find((x) => x.kind === k);
            return {
              key: k,
              label: `${i + 1}. ${DOC_KIND_LABEL[k]}`,
              extra: (
                <>
                  <StatusBadge status={d?.status ?? "none"} testId={`doc-step-${k}-status`} />
                  {d?.revisionRequested && <RevisionTag compact testId={`doc-step-${k}-revision`} />}
                </>
              ),
              href: stepHref(projectId, moduleId, k),
              testId: `doc-step-${k}`,
            };
          })}
        />
        {has && (
          <ApprovalBar
            status={doc.status}
            revisionRequested={doc.revisionRequested}
            isLead={isLead}
            busy={busy}
            disabledReason={draft !== null ? "Editing – save or cancel first" : doneLock}
            onDone={() => flow("Updating…", () => markArtifactDone("doc", moduleId, { ...actorBody, baseRev: doc.rev }), `${label} marked as done`)}
            onApprove={() => flow("Approving…", () => approveArtifact("doc", moduleId, { ...actorBody, baseRev: doc.rev }), `${label} approved`)}
            onRequestChange={() => flow("Updating…", () => requestArtifactChange("doc", moduleId, { ...actorBody, baseRev: doc.rev }), `Changes requested for ${label}`)}
          />
        )}
        {doc.status === "outdated" && <div className="warn-banner">Its sources (a previous step, the user stories or an approved screen design) changed after this document was written. Review it and click "Regenerate" or edit it to match.</div>}
        {conflict && <ConflictNotice onReload={reload} />}

        {draft !== null ? (
          <div className="paper" data-testid="doc-editor">
            <Field label="Markdown content" hint='Section headings use "## ", sub-sections "### ". Keep the ID patterns (UC-xx, FR-xx) in the UC Spec and FRD-NFR so test cases and traceability can read them.'>
              <textarea rows={24} value={draft} onChange={(e) => setDraft(e.target.value)} data-testid="doc-editor-text" />
            </Field>
            <div className="refine-row">
              <span className="spacer" />
              <Btn kind="ghost" onClick={() => setDraft(null)} data-testid="doc-editor-cancel">
                Cancel
              </Btn>
              <Btn kind="primary" onClick={saveDraft} data-testid="doc-editor-save">
                Save
              </Btn>
            </div>
          </div>
        ) : has ? (
          <article className="paper" data-testid="doc-content">
            <Markdown text={viewText(doc.content)} />
          </article>
        ) : (
          <Empty title={`No ${label} yet`}>
            {SOURCE[kind]} {lockReason ? lockReason : 'Click "Generate with AI" to start.'}
          </Empty>
        )}
      </div>

      {refining && (
        <Modal
          title={`Refine ${label} with AI`}
          onClose={() => setRefining(false)}
          footer={
            <>
              <Btn kind="ghost" onClick={() => setRefining(false)}>
                Cancel
              </Btn>
              <Btn kind="primary" onClick={refine} disabled={!instruction.trim()} data-testid="doc-refine-submit">
                <Icon name="ai" size="sm" />
                Refine with AI
              </Btn>
            </>
          }
        >
          <Field label="Section to refine" hint="Only the selected section changes; the other sections stay the same.">
            <Select value={section} onChange={(v) => setSection(v)} placeholder="Whole document" options={titles.map((t) => ({ value: t, label: t }))} testId="doc-refine-section" />
          </Field>
          <Field label="Refinement instruction">
            <textarea rows={4} value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="e.g. add an exception flow for a lost connection" data-testid="doc-refine-text" autoFocus />
          </Field>
        </Modal>
      )}
    </div>
  );
}
