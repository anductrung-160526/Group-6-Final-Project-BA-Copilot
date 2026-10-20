// Màn "Yêu cầu nghiệp vụ" – user story cấp dự án (kế hoạch đợt 5, quyết định 5 + 17, mục 3 "C4"). Chủ sở hữu: C4.
// URL: #/p/:pid/stories[/<moduleId | "none">] (đoạn sau là bộ lọc module).
//
// - Bảng story theo dự án, nhóm theo module (lọc một module hoặc "Tất cả"). Mỗi dòng: mã US-xx, module, As a / I want /
//   So that, tiêu chí chấp nhận, độ ưu tiên, điểm QUS (bấm để bung lỗi), lên/xuống, Sửa/Xoá (RowActions).
// - "+ Thêm user story" thêm một dòng trống đang sửa ngay trong bảng; Sửa mở dòng sửa tại chỗ (không dùng Drawer để BA
//   thấy các story xung quanh khi viết). Mỗi lúc sửa một dòng.
// - Chặn đè: lưu/xoá gửi baseRev; 409 → ConflictNotice (Tải lại). Dòng đang sửa gửi nhịp presence("story", id) và hiện
//   EditingBadge khi người khác cũng đang mở story đó.
// - QUS chấm ngay trên trình duyệt bằng scoreStructured() (giống server), theo từng dòng + điểm tổng mỗi module.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createStory, del, get, isConflict, listStories, reorderStories, updateStory } from "../api.ts";
import { currentMemberId, useCurrentMember, withActor } from "../currentMember.ts";
import { usePresence } from "../presence.ts";
import { storiesHref, type ProjectPageProps } from "../projectMenu.ts";
import { QusDetail, QusSummary, QusToggle, toIssueItem } from "../components/QusPanel.tsx";
import { Badge, Btn, ConflictNotice, EditingBadge, Empty, Field, Icon, IconBtn, IssueList, RowActions, ScoreBadge, Select, fmtTime, useUI } from "../components/ui.tsx";
import { isBlankStructured, scoreStructured, storySentence, type OtherModuleStories, type QusResult, type StoryScore } from "../../shared/qus.ts";
import type { Module, StoryPriority, UserStory } from "../../shared/types.ts";

const NO_MODULE = "none";
const PRIORITIES: StoryPriority[] = ["High", "Medium", "Low"];
const PRIORITY_TONE: Record<StoryPriority, string> = { High: "red", Medium: "amber", Low: "gray" };
const COLS = 9;
const NEW_ID = "__new__";

/** Nội dung đang sửa của một dòng. */
interface Draft {
  id: string; // NEW_ID = dòng mới chưa lưu
  moduleId: string; // "" = chưa gắn module
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
  const { toast, confirm } = useUI();
  const { members } = useCurrentMember();
  const [modules, setModules] = useState<Module[] | null>(null);
  const [stories, setStories] = useState<UserStory[] | null>(null);
  const [filter, setFilter] = useState<string>(params[0] ?? "");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [rowConflict, setRowConflict] = useState(false);
  const [pageConflict, setPageConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const [openQus, setOpenQus] = useState<Record<string, boolean>>({});

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

  const qus = useMemo(() => scoreByGroup(stories ?? [], modules ?? []), [stories, modules]);
  const scoreOf = useMemo(() => {
    const m = new Map<string, StoryScore>();
    for (const r of qus.values()) for (const s of r.stories) if (s.id) m.set(s.id, s);
    return m;
  }, [qus]);

  if (!stories || !modules) return <div className="page muted">Đang tải…</div>;

  const moduleName = (id: string | null) => (id ? modules.find((m) => m.id === id)?.name ?? "Module đã xoá" : "Chưa gắn module");
  const original = draft && draft.id !== NEW_ID ? stories.find((s) => s.id === draft.id) : undefined;
  const dirty = !!draft && (draft.id === NEW_ID ? !sameDraft(draft, emptyDraft(draft.moduleId)) : !!original && !sameDraft(draft, draftOf(original)));

  /** Bắt đầu sửa / thêm – đang sửa dở dòng khác thì hỏi bỏ thay đổi. */
  const startEdit = async (next: Draft) => {
    if (dirty && !(await confirm({ title: "Bỏ thay đổi đang sửa?", message: "Nội dung chưa lưu của dòng đang sửa sẽ mất.", okLabel: "Bỏ thay đổi", danger: true }))) return;
    setRowConflict(false);
    setDraft(next);
  };
  const addStory = () => startEdit(emptyDraft(filter && filter !== NO_MODULE ? filter : ""));

  const save = async () => {
    if (!draft) return;
    const d = draft;
    if (isBlankStructured(d)) return toast("Nhập ít nhất một trong ba ô As a / I want / So that", "err");
    setBusy(true);
    try {
      const saved =
        d.id === NEW_ID ? await createStory(projectId, withActor(payloadOf(d))) : await updateStory(d.id, withActor({ ...payloadOf(d), baseRev: d.baseRev }));
      toast(d.id === NEW_ID ? `Đã thêm ${saved.code}` : `Đã lưu ${saved.code}`, "ok");
      setDraft(null);
      setRowConflict(false);
      await load();
    } catch (e: any) {
      if (isConflict(e)) setRowConflict(true);
      else toast(e.message, "err");
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
      if (!fresh) toast("Story này đã bị xoá", "info");
      setRowConflict(false);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (s: UserStory) => {
    try {
      const q = new URLSearchParams({ baseRev: String(s.rev), ...(currentMemberId() ? { actorId: currentMemberId()! } : {}) });
      await del(`/api/stories/${encodeURIComponent(s.id)}?${q}`);
      toast(`Đã xoá ${s.code}`, "ok");
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

  // Nhóm hiển thị: theo thứ tự module của dự án, "Chưa gắn module" cuối. Lọc → chỉ một nhóm.
  const keys = filter ? [filter] : [...modules.map((m) => m.id), NO_MODULE];
  const groups = keys
    .map((k) => ({
      key: k,
      name: moduleName(k === NO_MODULE ? null : k),
      list: stories.filter((s) => (s.moduleId ?? NO_MODULE) === k),
      hasNew: draft?.id === NEW_ID && (draft.moduleId || NO_MODULE) === k,
    }))
    .filter((g) => filter || g.list.length || g.hasNew);
  // Dòng mới gắn module khác bộ lọc đang chọn vẫn hiện ở nhóm đang xem cho tới khi lưu.
  if (draft?.id === NEW_ID && !groups.some((g) => g.hasNew) && groups.length) groups[groups.length - 1].hasNew = true;

  const filterOptions = [
    ...modules.map((m) => ({ value: m.id, label: m.name })),
    { value: NO_MODULE, label: "Chưa gắn module" },
  ];
  const moduleOptions = modules.map((m) => ({ value: m.id, label: m.name }));

  const editor = (d: Draft, code: string) => {
    const set = (patch: Partial<Draft>) => setDraft({ ...d, ...patch });
    const setAc = (i: number, v: string) => set({ acceptanceCriteria: d.acceptanceCriteria.map((c, j) => (j === i ? v : c)) });
    const live = isBlankStructured(d) ? undefined : scoreStructured([{ ...payloadOf(d), code }]).stories[0];
    const by = original ? memberName(original.updatedBy) : undefined;
    return (
      <tr className="detail-row" data-testid="story-editor">
        <td colSpan={COLS}>
          <div className="box">
            <div className="qus-title-wrap">
              <Badge tone="mint">{code}</Badge>
              <span>{d.id === NEW_ID ? "User story mới" : "Sửa user story"}</span>
              <EditingBadge names={others.map((o) => o.name)} />
              {original && (
                <span className="muted small">
                  Bản {original.rev}
                  {original.updatedAt ? ` · sửa ${fmtTime(original.updatedAt)}` : ""}
                  {by ? ` bởi ${by}` : ""}
                </span>
              )}
            </div>
            {rowConflict && <ConflictNotice onReload={reloadRow} busy={busy} />}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "var(--space-3)" }}>
              <Field label="Vai trò">
                <input value={d.asA} onChange={(e) => set({ asA: e.target.value })} placeholder="As a … (vai trò)" autoFocus data-testid="story-asA" />
              </Field>
              <Field label="Mong muốn">
                <input value={d.iWant} onChange={(e) => set({ iWant: e.target.value })} placeholder="I want … (mong muốn)" data-testid="story-iWant" />
              </Field>
              <Field label="Lợi ích">
                <input value={d.soThat} onChange={(e) => set({ soThat: e.target.value })} placeholder="So that … (lợi ích)" data-testid="story-soThat" />
              </Field>
              <Field label="Module">
                <Select value={d.moduleId} onChange={(v) => set({ moduleId: v })} options={moduleOptions} placeholder="Chưa gắn module" testId="story-module" />
              </Field>
              <Field label="Độ ưu tiên">
                <Select value={d.priority} onChange={(v) => v && set({ priority: v })} options={PRIORITIES.map((p) => ({ value: p, label: p }))} testId="story-priority" />
              </Field>
            </div>
            <Field label="Tiêu chí chấp nhận" hint="Mỗi dòng một tiêu chí kiểm chứng được. Dòng trống không được lưu.">
              <div className="issue-list">
                {d.acceptanceCriteria.map((c, i) => (
                  <div key={i} className="qus-title-wrap">
                    <span className="muted small">{i + 1}.</span>
                    <input
                      value={c}
                      onChange={(e) => setAc(i, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          set({ acceptanceCriteria: [...d.acceptanceCriteria.slice(0, i + 1), "", ...d.acceptanceCriteria.slice(i + 1)] });
                        }
                      }}
                      placeholder="Ví dụ: Hiện tối đa 20 đơn, mới nhất trước"
                      aria-label={`Tiêu chí ${i + 1}`}
                      data-testid="story-ac"
                    />
                    <IconBtn
                      icon="close"
                      label="Xoá tiêu chí"
                      onClick={() => set({ acceptanceCriteria: d.acceptanceCriteria.length > 1 ? d.acceptanceCriteria.filter((_, j) => j !== i) : [""] })}
                    />
                  </div>
                ))}
              </div>
            </Field>
            <div>
              <Btn size="sm" kind="ghost" onClick={() => set({ acceptanceCriteria: [...d.acceptanceCriteria, ""] })} data-testid="story-ac-add">
                <Icon name="plus" size="sm" /> Thêm tiêu chí
              </Btn>
            </div>
            {live && (
              <div className="issue-list" data-testid="story-live-qus">
                <div className="qus-title-wrap">
                  <span className="small">Chất lượng (QUS)</span>
                  <ScoreBadge score={live.score} />
                  <span className="muted small">Chỉ để tham khảo, vẫn lưu được.</span>
                </div>
                <IssueList issues={live.issues.map(toIssueItem)} empty="Đạt chuẩn QUS" />
              </div>
            )}
            <div className="qus-title-wrap">
              <span className="spacer" />
              <Btn onClick={() => (setDraft(null), setRowConflict(false))} disabled={busy} data-testid="story-cancel">
                Huỷ
              </Btn>
              <Btn kind="primary" onClick={save} disabled={busy || rowConflict} data-testid="story-save">
                {d.id === NEW_ID ? "Thêm" : "Lưu"}
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
          <td>{s.moduleId ? moduleName(s.moduleId) : <span className="muted">Chưa gắn</span>}</td>
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
              <span className="muted small">Chưa có</span>
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
              <IconBtn icon="up" label="Chuyển lên" onClick={() => move(list, idx, -1)} disabled={idx === 0} />
              <IconBtn icon="down" label="Chuyển xuống" onClick={() => move(list, idx, 1)} disabled={idx === list.length - 1} />
              <RowActions
                onEdit={() => startEdit(draftOf(s))}
                onDelete={() => remove(s)}
                deleteConfirm={{ title: `Xoá ${s.code}?`, message: "Tài liệu đang có của module sẽ chuyển Lỗi thời." }}
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
          <h1>Yêu cầu nghiệp vụ</h1>
          <p className="muted">{stories.length} user story · mỗi story gắn một module, viết theo mẫu As a / I want / So that kèm tiêu chí chấp nhận</p>
        </div>
        <Btn kind="primary" onClick={addStory} disabled={busy} data-testid="story-add">
          <Icon name="plus" size="sm" /> Thêm user story
        </Btn>
      </div>

      <div className="filters" style={{ margin: "0 0 var(--space-4)" }}>
        <Select value={filter} onChange={pickFilter} placeholder="Tất cả module" options={filterOptions} testId="stories-module-filter" />
      </div>

      {pageConflict && (
        <ConflictNotice
          onReload={() => {
            setPageConflict(false);
            load().catch((e) => toast(e.message, "err"));
          }}
        />
      )}

      {stories.length === 0 && !draft ? (
        <Empty title="Chưa có user story nào">
          Bấm "+ Thêm user story" để thêm dòng đầu tiên: chọn module, nhập vai trò (As a), mong muốn (I want), lợi ích (So that) và các tiêu chí chấp nhận.
          Tài liệu BRD của module sẽ được sinh từ các story này.
        </Empty>
      ) : (
        groups.map((g) => {
          const result = qus.get(g.key);
          return (
            <section key={g.key} style={{ marginBottom: "var(--space-6)" }} data-testid={`stories-group-${g.key}`}>
              <div className="qus-title-wrap">
                <h2>{g.name}</h2>
                <Badge>{g.list.length}</Badge>
                {result && <QusSummary result={result} testId={`qus-module-${g.key}`} />}
              </div>
              {g.list.length === 0 && !g.hasNew ? (
                <Empty title="Module này chưa có user story">Bấm "+ Thêm user story" để thêm story cho module {g.name}.</Empty>
              ) : (
                <div className="table-wrap">
                  <table className="tbl" data-testid="stories-table">
                    <thead>
                      <tr>
                        <th>Mã</th>
                        <th>Module</th>
                        <th>As a</th>
                        <th>I want</th>
                        <th>So that</th>
                        <th>Tiêu chí chấp nhận</th>
                        <th>Ưu tiên</th>
                        <th>QUS</th>
                        <th className="actions" />
                      </tr>
                    </thead>
                    <tbody>
                      {g.list.map((s, i) => row(s, g.list, i))}
                      {g.hasNew && draft && editor(draft, "Mới")}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
