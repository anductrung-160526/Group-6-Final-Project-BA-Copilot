// Màn "Yêu cầu nghiệp vụ" – user story cấp dự án (kế hoạch đợt 5, quyết định 5 + 17, mục 3 "C4"). Chủ sở hữu: C4.
// URL: #/p/:pid/stories[/<moduleId | "none">] (đoạn sau là bộ lọc module).
//
// - Bảng story theo dự án, nhóm theo module (lọc một module hoặc "Tất cả"). Mỗi dòng: mã US-xx, module, As a / I want /
//   So that, tiêu chí chấp nhận, độ ưu tiên, điểm QUS (bấm để bung lỗi), lên/xuống, Sửa/Xoá (RowActions).
// - "+ Thêm user story" thêm một dòng trống đang sửa ngay trong bảng; Sửa mở dòng sửa tại chỗ (không dùng Drawer để BA
//   thấy các story xung quanh khi viết). Mỗi lúc sửa một dòng.
// - Chặn đè: lưu/xoá gửi baseRev; 409 → ConflictNotice (Tải lại). Dòng đang sửa gửi nhịp presence("story", id) và hiện
//   EditingBadge khi người khác cũng đang mở story đó.
// - QUS chấm ngay trên trình duyệt bằng scoreStructured() (giống server), theo từng dòng + điểm tổng mỗi module. Mô hình
//   NLP (public/nlp.js) chưa tải xong thì chưa có điểm, chỉ hiện QusModelStatus.
// - Đợt 6 (D3) – module trước, story sau: nút "+ Module" (hộp thoại Module mới) nằm ở đầu màn này (đã gỡ khỏi khung
//   "Thực hiện công việc"). Story phải gắn một module: dự án chưa có module thì "+ Thêm user story" bị khoá kèm lời nhắc;
//   dòng mới mặc định chọn module đang lọc (hoặc module duy nhất). Story cũ chưa gắn module (module đã xoá) nằm ở nhóm
//   "Chưa gắn module", bấm Sửa để chọn module rồi Lưu (không bỏ gắn được).

import { useAqusa } from "../useAqusa.ts";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, createStory, del, get, isConflict, listStories, post, reorderStories, updateStory } from "../api.ts";
import { currentMemberId, useCurrentMember, withActor } from "../currentMember.ts";
import { usePresence } from "../presence.ts";
import { storiesHref, type ProjectPageProps } from "../projectMenu.ts";
import { QusDetail, QusModelStatus, QusSummary, QusToggle, toIssueItem } from "../components/QusPanel.tsx";
import { Badge, Btn, ConflictNotice, EditingBadge, Empty, Field, Icon, IconBtn, IssueList, Modal, RowActions, ScoreBadge, Select, fmtTime, useUI } from "../components/ui.tsx";
import { isBlankStructured, scoreStructured, storySentence, type OtherModuleStories, type QusResult, type StoryScore } from "../../shared/qus.ts";
import type { Module, StoryPriority, UserStory } from "../../shared/types.ts";
import { MODULE_NAME_MAX, MSG, projectNameKey } from "../../shared/projectName.ts";

const NO_MODULE = "none";
const PRIORITIES: StoryPriority[] = ["High", "Medium", "Low"];
const PRIORITY_TONE: Record<StoryPriority, string> = { High: "red", Medium: "amber", Low: "gray" };
const COLS = 9;
const NEW_ID = "__new__";
/** Nhóm tạm chứa dòng mới chưa chọn module (hoặc chọn module khác bộ lọc đang xem). */
const NEW_GROUP = "new";
const NEED_MODULE = "Create a module before adding user stories";

/** Nội dung đang sửa của một dòng. */
interface Draft {
  id: string; // NEW_ID = dòng mới chưa lưu
  moduleId: string; // "" = chưa chọn (dòng mới) / story cũ chưa gắn module – phải chọn trước khi lưu
  asA: string;
  iWant: string;
  soThat: string;
  acceptanceCriteria: string[];
  priority: StoryPriority;
  baseRev?: number;
}

const draftOf = (s: UserStory): Draft => ({
  id: s.id,
  moduleId: s.moduleId ?? "",
  asA: s.asA,
  iWant: s.iWant,
  soThat: s.soThat,
  acceptanceCriteria: s.acceptanceCriteria.length ? [...s.acceptanceCriteria] : [""],
  priority: s.priority,
  baseRev: s.rev,
});

const emptyDraft = (moduleId: string): Draft => ({ id: NEW_ID, moduleId, asA: "", iWant: "", soThat: "", acceptanceCriteria: [""], priority: "Medium" });

const payloadOf = (d: Draft) => ({
  moduleId: d.moduleId || null,
  asA: d.asA,
  iWant: d.iWant,
  soThat: d.soThat,
  acceptanceCriteria: d.acceptanceCriteria.map((c) => c.trim()).filter(Boolean),
  priority: d.priority,
});

const sameDraft = (a: Draft, b: Draft) => JSON.stringify(payloadOf(a)) === JSON.stringify(payloadOf(b));

/** Chấm QUS theo module: story của module + câu đã ghép của các module khác (bắt trùng chéo module, G1). */
function scoreByGroup(stories: UserStory[], modules: Module[]): Map<string, QusResult> {
  const groups = new Map<string, UserStory[]>();
  for (const s of stories) {
    const k = s.moduleId ?? NO_MODULE;
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  const sentences = (k: string) => (groups.get(k) ?? []).filter((s) => !isBlankStructured(s)).map(storySentence);
  const out = new Map<string, QusResult>();
  for (const [k, list] of groups) {
    const others: OtherModuleStories[] =
      k === NO_MODULE ? [] : modules.filter((m) => m.id !== k).map((m) => ({ moduleName: m.name, stories: sentences(m.id) }));
    out.set(k, scoreStructured(list, { others }));
  }
  return out;
}

export function StoriesView({ projectId, params }: ProjectPageProps) {
  const { toast, confirm, run } = useUI();
  const { members } = useCurrentMember();
  const [modules, setModules] = useState<Module[] | null>(null);
  const [stories, setStories] = useState<UserStory[] | null>(null);
  const [filter, setFilter] = useState<string>(params[0] ?? "");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [rowConflict, setRowConflict] = useState(false);
  const [pageConflict, setPageConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const [openQus, setOpenQus] = useState<Record<string, boolean>>({});
  const [newModule, setNewModuleRaw] = useState<string | null>(null); // tên module đang nhập, null = đóng hộp thoại
  const [moduleErr, setModuleErr] = useState<string | null>(null); // lỗi máy chủ trả về cho tên module (409 trùng, 400)
  const setNewModule = (v: string | null) => {
    setNewModuleRaw(v);
    setModuleErr(null);
  };
  // Ô tiêu chí cần đặt con trỏ sau lần vẽ tới (Enter / "Thêm tiêu chí" tạo dòng mới).
  const acRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [focusAc, setFocusAc] = useState<number | null>(null);
  useEffect(() => {
    if (focusAc === null) return;
    acRefs.current[focusAc]?.focus();
    setFocusAc(null);
  }, [focusAc]);

  useEffect(() => setFilter(params[0] ?? ""), [params[0]]);

  const load = useCallback(async () => {
    const [p, list] = await Promise.all([get<{ modules: Module[] }>(`/api/projects/${encodeURIComponent(projectId)}`), listStories(projectId)]);
    setModules(p.modules);
    setStories(list);
    return list;
  }, [projectId]);

  useEffect(() => {
    load().catch((e) => toast(e.message, "err"));
  }, [load]);

  const others = usePresence("story", draft && draft.id !== NEW_ID ? draft.id : null);
  const memberName = (id: string | null) => (id ? members.find((m) => m.id === id)?.name : undefined);

  const pickFilter = (v: string) => {
    setFilter(v);
    const href = storiesHref(projectId) + (v ? `/${encodeURIComponent(v)}` : "");
    if (window.location.hash !== href) window.location.hash = href;
  };

  // Tải mô hình NLP của bộ chấm QUS; chưa xong thì chưa có điểm (không chấm thay bằng luật).
  const nlp = useAqusa();
  const qus = useMemo(() => (nlp === "ready" ? scoreByGroup(stories ?? [], modules ?? []) : new Map<string, QusResult>()), [stories, modules, nlp]);
  const scoreOf = useMemo(() => {
    const m = new Map<string, StoryScore>();
    for (const r of qus.values()) for (const s of r.stories) if (s.id) m.set(s.id, s);
    return m;
  }, [qus]);

  if (!stories || !modules) return <div className="page muted">Loading…</div>;

  const moduleName = (id: string | null) => (id ? modules.find((m) => m.id === id)?.name ?? "Deleted module" : "No module");
  const original = draft && draft.id !== NEW_ID ? stories.find((s) => s.id === draft.id) : undefined;
  const dirty = !!draft && (draft.id === NEW_ID ? !sameDraft(draft, emptyDraft(draft.moduleId)) : !!original && !sameDraft(draft, draftOf(original)));

  /** Bắt đầu sửa / thêm – đang sửa dở dòng khác thì hỏi bỏ thay đổi. */
  const startEdit = async (next: Draft) => {
    if (dirty && !(await confirm({ title: "Discard unsaved changes?", message: "Unsaved content in the row being edited will be lost.", okLabel: "Discard changes", danger: true }))) return;
    setRowConflict(false);
    setDraft(next);
  };
  const noModule = modules.length === 0;
  /** Module mặc định của dòng mới: module đang lọc, không thì module duy nhất của dự án; còn lại để BA tự chọn. */
  const defaultModule = () => (modules.some((m) => m.id === filter) ? filter : modules.length === 1 ? modules[0].id : "");
  const addStory = () => {
    if (noModule) return toast(NEED_MODULE, "err");
    startEdit(emptyDraft(defaultModule()));
  };

  // Tên module trùng module khác của dự án: báo ngay khi gõ (cùng khoá so sánh với máy chủ – shared/projectName.ts).
  const moduleKey = projectNameKey(newModule ?? "");
  const moduleNameError =
    moduleKey && modules.some((m) => projectNameKey(m.name) === moduleKey) ? MSG.duplicateModule((newModule ?? "").trim()) : moduleErr;
  const createModule = async () => {
    const name = (newModule ?? "").trim();
    if (!name || moduleNameError) return;
    let invalid = null as string | null;
    const m = await run("Creating module", async () => {
      try {
        return await post<Module>(`/api/projects/${encodeURIComponent(projectId)}/modules`, { name });
      } catch (e) {
        // Trùng tên / tên sai → hiện dưới ô, giữ hộp thoại mở
        if (e instanceof ApiError && (e.status === 409 || e.status === 400) && !e.code) {
          invalid = e.message;
          return undefined;
        }
        throw e;
      }
    });
    if (invalid) {
      setModuleErr(invalid);
      load().catch(() => {}); // cập nhật danh sách để lần sau phát hiện trùng ngay khi gõ
      return;
    }
    if (!m) return;
    setNewModule(null);
    window.dispatchEvent(new Event("bacopilot:modules-changed")); // ProjectShell tải lại module cho menu trái
    toast(`Module ${m.name} created – add user stories to it`, "ok");
    await load().catch((e) => toast(e.message, "err"));
    pickFilter(m.id);
  };

  const save = async () => {
    if (!draft) return;
    const d = draft;
    if (!d.moduleId || !modules.some((m) => m.id === d.moduleId)) return toast(noModule ? NEED_MODULE : "Select a module for the user story", "err");
    if (isBlankStructured(d)) return toast("Fill in at least one of As a / I want / So that", "err");
    setBusy(true);
    try {
      const saved =
        d.id === NEW_ID ? await createStory(projectId, withActor(payloadOf(d))) : await updateStory(d.id, withActor({ ...payloadOf(d), baseRev: d.baseRev }));
      toast(d.id === NEW_ID ? `Added ${saved.code}` : `Saved ${saved.code}`, "ok");
      setDraft(null);
      setRowConflict(false);
      await load();
    } catch (e: any) {
      if (isConflict(e)) {
        setRowConflict(true);
        toast(`${e.message} – someone just edited this story`, "err");
      } else toast(e.message, "err");
    } finally {
      setBusy(false);
    }
  };

  /** Tải lại sau 409: lấy bản mới của story đang sửa (bỏ nội dung đang gõ). */
  const reloadRow = async () => {
    setBusy(true);
    try {
      const list = await load();
      const fresh = draft ? list.find((s) => s.id === draft.id) : undefined;
      setDraft(fresh ? draftOf(fresh) : null);
      if (!fresh) toast("This story has been deleted", "info");
      setRowConflict(false);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (s: UserStory) => {
    try {
      const q = new URLSearchParams({ baseRev: String(s.rev), ...(currentMemberId() ? { actorId: currentMemberId()! } : {}) });
      await del(`/api/stories/${encodeURIComponent(s.id)}?${q}`);
      toast(`Deleted ${s.code}`, "ok");
      if (draft?.id === s.id) setDraft(null);
      await load();
    } catch (e: any) {
      if (isConflict(e)) setPageConflict(true);
      else toast(e.message, "err");
    }
  };

  /** Đổi chỗ story với story liền trên/dưới trong cùng nhóm đang hiển thị. */
  const move = async (list: UserStory[], idx: number, dir: -1 | 1) => {
    const a = list[idx];
    const b = list[idx + dir];
    if (!a || !b) return;
    const ids = stories.map((s) => s.id);
    const ia = ids.indexOf(a.id);
    const ib = ids.indexOf(b.id);
    [ids[ia], ids[ib]] = [ids[ib], ids[ia]];
    try {
      setStories(await reorderStories(projectId, ids));
    } catch (e: any) {
      toast(e.message, "err");
    }
  };

  // Nhóm hiển thị: theo thứ tự module của dự án, "Chưa gắn module" (story cũ) cuối. Lọc → chỉ một nhóm.
  const newKey = draft?.id === NEW_ID ? draft.moduleId : null;
  const keys = filter ? [filter] : [...modules.map((m) => m.id), NO_MODULE];
  const groups = keys
    .map((k) => ({
      key: k,
      name: moduleName(k === NO_MODULE ? null : k),
      list: stories.filter((s) => (s.moduleId ?? NO_MODULE) === k),
      hasNew: newKey === k,
    }))
    .filter((g) => filter || g.list.length || g.hasNew);
  // Dòng mới chưa chọn module / chọn module khác bộ lọc: hiện ở nhóm tạm trên cùng cho tới khi lưu.
  if (newKey !== null && !groups.some((g) => g.hasNew)) groups.unshift({ key: NEW_GROUP, name: "New user story", list: [], hasNew: true });

  const unassigned = stories.filter((s) => !s.moduleId).length;
  const filterOptions = [
    ...modules.map((m) => ({ value: m.id, label: m.name })),
    ...(unassigned || filter === NO_MODULE ? [{ value: NO_MODULE, label: "No module" }] : []),
  ];
  const moduleOptions = modules.map((m) => ({ value: m.id, label: m.name }));

  const editor = (d: Draft, code: string) => {
    const set = (patch: Partial<Draft>) => setDraft({ ...d, ...patch });
    const setAc = (i: number, v: string) => set({ acceptanceCriteria: d.acceptanceCriteria.map((c, j) => (j === i ? v : c)) });
    const live = nlp !== "ready" || isBlankStructured(d) ? undefined : scoreStructured([{ ...payloadOf(d), code }]).stories[0];
    const by = original ? memberName(original.updatedBy) : undefined;
    return (
      <tr className="detail-row" data-testid="story-editor">
        <td colSpan={COLS}>
          <div className="box">
            <div className="qus-title-wrap">
              <Badge>{code}</Badge>
              <span>{d.id === NEW_ID ? "New user story" : "Edit user story"}</span>
              <EditingBadge names={others.map((o) => o.name)} />
              {original && (
                <span className="muted small">
                  Revision {original.rev}
                  {original.updatedAt ? ` · edited ${fmtTime(original.updatedAt)}` : ""}
                  {by ? ` by ${by}` : ""}
                </span>
              )}
            </div>
            {rowConflict && <ConflictNotice onReload={reloadRow} busy={busy} />}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "var(--space-3)" }}>
              <Field label="Role">
                <input value={d.asA} onChange={(e) => set({ asA: e.target.value })} placeholder="As a … (role)" autoFocus data-testid="story-asA" />
              </Field>
              <Field label="Goal">
                <input value={d.iWant} onChange={(e) => set({ iWant: e.target.value })} placeholder="I want … (goal)" data-testid="story-iWant" />
              </Field>
              <Field label="Benefit">
                <input value={d.soThat} onChange={(e) => set({ soThat: e.target.value })} placeholder="So that … (benefit)" data-testid="story-soThat" />
              </Field>
              <Field label="Module">
                <Select
                  value={d.moduleId}
                  onChange={(v) => set({ moduleId: v })}
                  options={moduleOptions}
                  placeholder={d.moduleId ? undefined : "Select module…"}
                  testId="story-module"
                />
              </Field>
              <Field label="Priority">
                <Select value={d.priority} onChange={(v) => v && set({ priority: v })} options={PRIORITIES.map((p) => ({ value: p, label: p }))} testId="story-priority" />
              </Field>
            </div>
            <Field label="Acceptance Criteria" hint="One verifiable criterion per line. Empty lines are not saved.">
              <div className="issue-list">
                {d.acceptanceCriteria.map((c, i) => (
                  <div key={i} className="qus-title-wrap">
                    <span className="muted small">{i + 1}.</span>
                    <input
                      ref={(el) => {
                        acRefs.current[i] = el;
                      }}
                      value={c}
                      onChange={(e) => setAc(i, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          set({ acceptanceCriteria: [...d.acceptanceCriteria.slice(0, i + 1), "", ...d.acceptanceCriteria.slice(i + 1)] });
                          setFocusAc(i + 1);
                        }
                      }}
                      placeholder="E.g. Show at most 20 orders, newest first"
                      aria-label={`Criterion ${i + 1}`}
                      data-testid="story-ac"
                    />
                    <IconBtn
                      icon="close"
                      label="Remove criterion"
                      onClick={() => set({ acceptanceCriteria: d.acceptanceCriteria.length > 1 ? d.acceptanceCriteria.filter((_, j) => j !== i) : [""] })}
                    />
                  </div>
                ))}
              </div>
            </Field>
            <div>
              <Btn size="sm" kind="ghost" onClick={() => (set({ acceptanceCriteria: [...d.acceptanceCriteria, ""] }), setFocusAc(d.acceptanceCriteria.length))} data-testid="story-ac-add">
                <Icon name="plus" size="sm" /> Add criterion
              </Btn>
            </div>
            {live && (
              <div className="issue-list" data-testid="story-live-qus">
                <div className="qus-title-wrap">
                  <span className="small">Quality (QUS)</span>
                  <ScoreBadge score={live.score} />
                  <span className="muted small">For reference only; you can still save.</span>
                </div>
                <IssueList issues={live.issues.map(toIssueItem)} empty="Meets the QUS criteria" />
              </div>
            )}
            {!isBlankStructured(d) && <QusModelStatus status={nlp} />}
            <div className="qus-title-wrap">
              <span className="spacer" />
              <Btn onClick={() => (setDraft(null), setRowConflict(false))} disabled={busy} data-testid="story-cancel">
                Cancel
              </Btn>
              <Btn kind="primary" onClick={save} disabled={busy || rowConflict} data-testid="story-save">
                {d.id === NEW_ID ? "Add" : "Save"}
              </Btn>
            </div>
          </div>
        </td>
      </tr>
    );
  };

  const row = (s: UserStory, list: UserStory[], idx: number) => {
    if (draft?.id === s.id) return <React.Fragment key={s.id}>{editor(draft, s.code)}</React.Fragment>;
    const score = scoreOf.get(s.id);
    const open = !!openQus[s.id] && !!score;
    const text = (v: string) => (v.trim() ? v : <span className="muted">—</span>);
    return (
      <React.Fragment key={s.id}>
        <tr data-testid={`story-row-${s.code}`}>
          <td className="nowrap strong">{s.code}</td>
          <td>{s.moduleId ? moduleName(s.moduleId) : <Badge tone="amber">No module</Badge>}</td>
          <td>{text(s.asA)}</td>
          <td>{text(s.iWant)}</td>
          <td>{text(s.soThat)}</td>
          <td>
            {s.acceptanceCriteria.length ? (
              <ol className="small" style={{ margin: 0, paddingLeft: "var(--space-4)" }}>
                {s.acceptanceCriteria.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ol>
            ) : (
              <span className="muted small">None yet</span>
            )}
          </td>
          <td>
            <Badge tone={PRIORITY_TONE[s.priority]}>{s.priority}</Badge>
          </td>
          <td>
            <QusToggle score={score} open={open} onToggle={() => setOpenQus((o) => ({ ...o, [s.id]: !o[s.id] }))} testId={`story-qus-${s.code}`} />
          </td>
          <td className="actions">
            <span className="row-actions">
              <IconBtn icon="up" label="Move up" onClick={() => move(list, idx, -1)} disabled={idx === 0} />
              <IconBtn icon="down" label="Move down" onClick={() => move(list, idx, 1)} disabled={idx === list.length - 1} />
              <RowActions
                onEdit={() => startEdit(draftOf(s))}
                onDelete={() => remove(s)}
                deleteConfirm={{ title: `Delete ${s.code}?`, message: "The module's existing documents will become Outdated." }}
                testId={`story-${s.code}`}
              />
            </span>
          </td>
        </tr>
        {open && score && (
          <tr className="detail-row">
            <td colSpan={COLS}>
              <QusDetail score={score} />
            </td>
          </tr>
        )}
      </React.Fragment>
    );
  };

  return (
    <div className="page" data-testid="stories-view">
      <div className="page-head">
        <div>
          <h1>Business Requirements</h1>
          <p className="muted">{stories.length} {stories.length === 1 ? "user story" : "user stories"} · each story belongs to one module and follows the As a / I want / So that template with acceptance criteria</p>
        </div>
        <div className="qus-title-wrap">
          {stories.length > 0 && <QusModelStatus status={nlp} />}
          {noModule && (
            <span className="muted small" style={{ fontWeight: "var(--font-weight-regular)" }} data-testid="story-add-hint">
              {NEED_MODULE}
            </span>
          )}
          <Btn onClick={() => setNewModule("")} disabled={busy} data-testid="new-module">
            <Icon name="plus" size="sm" /> Module
          </Btn>
          <Btn kind="primary" onClick={addStory} disabled={busy || noModule} title={noModule ? NEED_MODULE : undefined} data-testid="story-add">
            <Icon name="plus" size="sm" /> Add user story
          </Btn>
        </div>
      </div>

      {filterOptions.length > 0 && (
        <div className="filters" style={{ margin: "0 0 var(--space-4)" }}>
          <Select value={filter} onChange={pickFilter} placeholder="All modules" options={filterOptions} testId="stories-module-filter" />
        </div>
      )}

      {pageConflict && (
        <ConflictNotice
          onReload={() => {
            setPageConflict(false);
            load().catch((e) => toast(e.message, "err"));
          }}
        />
      )}

      {noModule && (
        <div data-testid="stories-no-module">
          <Empty title="No modules yet">
            Create a module before adding user stories. A module is a group of features (e.g. Authentication, Order Management); each user story belongs to one module.
            <div style={{ marginTop: "var(--space-3)" }}>
              <Btn kind="primary" onClick={() => setNewModule("")} data-testid="new-module-empty">
                <Icon name="plus" size="sm" /> Create module
              </Btn>
            </div>
          </Empty>
        </div>
      )}

      {noModule && stories.length === 0 ? null : stories.length === 0 && !draft ? (
        <Empty title="No user stories yet">
          Click "+ Add user story" to add the first row: select a module, then enter the role (As a), goal (I want), benefit (So that) and acceptance criteria.
          The module's BRD will be generated from these stories.
        </Empty>
      ) : (
        groups.map((g) => {
          const result = qus.get(g.key);
          return (
            <section key={g.key} style={{ marginBottom: "var(--space-6)" }} data-testid={`stories-group-${g.key}`}>
              <div className="qus-title-wrap">
                <h2>{g.name}</h2>
                {g.key !== NEW_GROUP && <Badge>{g.list.length}</Badge>}
                {result && <QusSummary result={result} testId={`qus-module-${g.key}`} />}
              </div>
              {g.key === NO_MODULE && g.list.length > 0 && (
                <p className="muted small" data-testid="stories-unassigned-hint">
                  These stories do not belong to any module (their module was deleted). Click Edit, select a module, then Save to reassign them.
                </p>
              )}
              {g.list.length === 0 && !g.hasNew ? (
                <Empty title={g.key === NO_MODULE ? "No stories without a module" : "This module has no user stories yet"}>
                  {g.key === NO_MODULE ? "Every user story belongs to a module." : `Click "+ Add user story" to add stories to module ${g.name}.`}
                </Empty>
              ) : (
                <div className="table-wrap">
                  <table className="tbl" data-testid="stories-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Module</th>
                        <th>As a</th>
                        <th>I want</th>
                        <th>So that</th>
                        <th>Acceptance Criteria</th>
                        <th>Priority</th>
                        <th>QUS</th>
                        <th className="actions" />
                      </tr>
                    </thead>
                    <tbody>
                      {g.list.map((s, i) => row(s, g.list, i))}
                      {g.hasNew && draft && editor(draft, "New")}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          );
        })
      )}

      {newModule !== null && (
        <Modal
          title="New module"
          onClose={() => setNewModule(null)}
          footer={
            <>
              <Btn onClick={() => setNewModule(null)}>Cancel</Btn>
              <Btn kind="primary" disabled={!newModule.trim() || !!moduleNameError} onClick={createModule} data-testid="create-module">
                Create module
              </Btn>
            </>
          }
        >
          <Field
            label="Module name"
            error={moduleNameError}
            hint="Once created, add user stories to the module right here. Documents, diagrams, prototypes… are produced under Deliverables."
          >
            <input
              autoFocus
              value={newModule}
              maxLength={MODULE_NAME_MAX}
              aria-invalid={!!moduleNameError}
              onChange={(e) => setNewModule(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createModule()}
              placeholder="E.g. User Authentication"
              data-testid="module-name"
            />
          </Field>
        </Modal>
      )}
    </div>
  );
}
