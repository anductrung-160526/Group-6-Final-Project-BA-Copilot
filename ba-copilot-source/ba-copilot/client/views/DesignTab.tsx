// Design Studio: prompt sinh màn hình, khoanh vùng (click / kéo khung), bình luận theo vùng,
// gửi bình luận vào prompt, prompt sửa theo vùng, lịch sử phiên bản, xem thử prototype,
// gợi ý element (chỉ mô hình trong model/): khung mờ phần tử tiếp theo + "Tự hoàn thiện bố cục" (Recursive Transformer,
// Li et al. 2020) và vạch chèn phần tử còn thiếu giữa các phần tử đã có (Transformer phát hiện chỗ thiếu).
// Đợt 5 (C9): bước "Prototype" của "Thực hiện công việc" (PrototypeStep). AI sinh/sửa màn theo SRS + FRD-NFR + user story;
// trạng thái Xong / Duyệt / Yêu cầu sửa qua ApprovalBar; mọi lệnh sửa màn gửi baseRev (409 → ConflictNotice);
// "Đang được sửa bởi …" qua usePresence. Bình luận theo component giữ nguyên – đó là cách BA Lead góp ý.

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api, get, post, patch, del, download, approveArtifact, getArtifactState, isConflict, markArtifactDone, requestArtifactChange, screenHtmlUrl } from "../api.ts";
import type { Annotation, ArtifactStatus, ModuleDetail, ScreenVersion } from "../../shared/types.ts";
import type { WorkStepProps } from "../projectMenu.ts";
import { usePresence } from "../presence.ts";
import { findNode, nodeLabel, topMostIds, UINode } from "../../shared/design.ts";
import { Renderer } from "../components/Renderer.tsx";
import { SuggestionsPanel } from "../components/SuggestionsPanel.tsx";
import { RelatedTasks } from "../components/RelatedTasks.tsx";
import { actorQuery, currentMemberId, useCurrentMember, withActor } from "../currentMember.ts";
import { SampleBadge, ApprovalBar, Badge, Btn, GitOutcome, ConflictNotice, EditingBadge, Empty, Field, Icon, Modal, RowActions, StatusBadge, fmtTime, useUI } from "../components/ui.tsx";

type Mode = "select" | "region" | "prototype";
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const TEMPLATES = [
  { name: "Sign in", prompt: "Sign-in screen with email and password, a remember-me option, forgot password and a sign-up link." },
  { name: "Product management", prompt: "Product management screen: search by name, filter by category and status, a list table with edit/delete, an add button and pagination." },
  { name: "Add product", prompt: "Add product form: name, SKU, category, price, stock quantity, description, image; Save and Cancel buttons." },
  { name: "Home", prompt: "Admin overview dashboard: revenue, orders and new customers metrics, plus a recent orders table." },
];

// tên thành phần hiển thị cho người dùng (giá trị lưu trữ vẫn là tên loại gốc)
const TYPE_LABEL: Record<string, string> = {
  Sidebar: "Side bar", Textarea: "Multi-line input", Input: "Text input", Select: "Dropdown", Radio: "Radio button", DatePicker: "Date picker",
  Badge: "Label", Alert: "Notice", Stat: "Metric", Avatar: "Profile picture",
};
const typeName = (t?: string | null) => (t ? TYPE_LABEL[t] ?? t : "");
const typeLabel = (l: string) => l.replace(/^\w+/, (m) => TYPE_LABEL[m] ?? m);

// vi-keep: bỏ dấu tiếng Việt khi so tên màn
// vi-keep: bỏ dấu tiếng Việt khi so tên màn
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().trim();

const STATUS_TEXT: Record<ArtifactStatus, string> = { none: "not started", draft: "draft", done: "done", approved: "approved", outdated: "outdated" };

/** Bước 3 "Prototype" trong "Thực hiện công việc": nạp ModuleDetail của module đang chọn rồi dựng Design Studio. */
export function PrototypeStep({ projectId, moduleId, params }: WorkStepProps) {
  const { toast } = useUI();
  const [m, setM] = useState<ModuleDetail | null>(null);
  const reload = useCallback(
    () =>
      get<ModuleDetail>(`/api/modules/${encodeURIComponent(moduleId)}`)
        .then(setM)
        .catch((e) => toast(e.message, "err")),
    [moduleId],
  );
  useEffect(() => {
    setM(null);
    if (moduleId) reload();
  }, [reload, moduleId]);
  // Giữ màn đang mở trên URL (#/p/:pid/work/:mid/prototype/<screenId>) để gửi link cho BA Lead / mở lại đúng màn
  const onScreenChange = useCallback(
    (sid: string | null) => {
      const want = `#/p/${encodeURIComponent(projectId)}/work/${encodeURIComponent(moduleId)}/prototype${sid ? `/${encodeURIComponent(sid)}` : ""}`;
      if (window.location.hash !== want) window.history.replaceState(null, "", want);
    },
    [projectId, moduleId],
  );
  if (!moduleId)
    return (
      <div className="page">
        <Empty title="No module selected">Select a module at the top of the page to design the prototype.</Empty>
      </div>
    );
  if (!m || m.id !== moduleId) return <div className="page muted">Loading…</div>;
  return <DesignTab m={m} reload={reload} initialScreenId={params[0]} onScreenChange={onScreenChange} />;
}

export function DesignTab({ m, reload, initialScreenId, onScreenChange }: { m: ModuleDetail; reload: () => Promise<unknown>; initialScreenId?: string; onScreenChange?: (screenId: string | null) => void }) {
  const { run, toast, confirm } = useUI();
  const { me, members } = useCurrentMember(); // FN-03: người thao tác gửi kèm actorId
  const isLead = me?.role === "BA_LEAD";
  // Xoá góp ý: tác giả hoặc BA Lead (server 403); nhóm chưa có BA Lead thì ai cũng được
  const canDeleteComment = (a: Annotation) => isLead || (!!a.authorId && a.authorId === me?.id) || !members.some((x) => x.role === "BA_LEAD");
  const [screenId, setScreenId] = useState<string | null>(() => (initialScreenId && m.screens.some((s) => s.id === initialScreenId) ? initialScreenId : m.screens[0]?.id ?? null));
  const [conflict, setConflict] = useState(false);
  const [rename, setRename] = useState<string | null>(null);
  const [docCtx, setDocCtx] = useState<{ srs: ArtifactStatus; frd: ArtifactStatus } | null>(null);
  const [mode, setMode] = useState<Mode>("select");
  const [selected, setSelected] = useState<string[]>([]);
  const [hover, setHover] = useState<string | null>(null);
  const [versions, setVersions] = useState<ScreenVersion[]>([]);
  const [viewVersion, setViewVersion] = useState<string | null>(null);
  const [showChanges, setShowChanges] = useState(true);
  const [comment, setComment] = useState("");
  const [prompt, setPrompt] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [panel, setPanel] = useState<"edit" | "versions" | "layers" | "suggest">("edit");
  // gợi ý bố cục
  const [layoutOn, setLayoutOn] = useState(() => {
    try {
      return localStorage.getItem("ba.layoutSuggest") !== "off";
    } catch {
      return true;
    }
  });
  const [next, setNext] = useState<NextResult | null>(null);
  const [which, setWhich] = useState(0); // vị trí đang hiển thị (khi không chọn gì, tối đa 3 container)
  const [pick, setPick] = useState(0); // loại ứng viên đang chọn trong top-3
  const [gapWhich, setGapWhich] = useState(0); // khe còn thiếu đang hiển thị (Transformer, tối đa 3)
  const [gapPick, setGapPick] = useState(0);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [complete, setComplete] = useState<{ versionId: string; items: GenItem[]; on: Set<string> } | null>(null);
  const shownRef = useRef<Set<string>>(new Set());
  const [newScreen, setNewScreen] = useState<{ name: string; prompt: string } | null>(null);
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [rects, setRects] = useState<Record<string, Rect>>({});
  const frameRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // giữ screenId hợp lệ khi danh sách thay đổi
  useEffect(() => {
    if (!m.screens.find((s) => s.id === screenId)) setScreenId(m.screens[0]?.id ?? null);
  }, [m.screens, screenId]);

  const screen = m.screens.find((s) => s.id === screenId) ?? null;
  const others = usePresence("screen", screenId);
  useEffect(() => {
    onScreenChange?.(screenId);
    setConflict(false);
  }, [screenId]);
  // Bối cảnh tài liệu AI dùng khi sinh màn (SRS, FRD-NFR của C5) – chỉ để BA biết, không chặn
  useEffect(() => {
    let alive = true;
    Promise.all([getArtifactState("doc", m.id, "SRS"), getArtifactState("doc", m.id, "FRD_NFR")])
      .then(([a, b]) => alive && setDocCtx({ srs: a.status, frd: b.status }))
      .catch(() => alive && setDocCtx(null));
    return () => {
      alive = false;
    };
  }, [m.id]);

  /**
   * Lệnh ghi màn: tự gửi baseRev = rev đang xem + actorId; 409 CONFLICT → hiện ConflictNotice (nút Tải lại).
   * Trả undefined khi lỗi (đã báo bằng toast).
   */
  const writeScreen = <T,>(label: string, path: string, body: Record<string, unknown>, method: "POST" | "PATCH" | "DELETE" = "POST") =>
    run<T>(label, async () => {
      try {
        const b = withActor({ ...body, baseRev: screen?.rev });
        return await (method === "POST" ? post<T>(path, b) : api<T>(method, path, b));
      } catch (e) {
        if (isConflict(e)) {
          setConflict(true);
          throw new Error("Someone else just edited this screen – click Reload to see the latest version, then continue editing");
        }
        throw e;
      }
    });
  const reloadAfterConflict = async () => {
    await reload();
    await loadVersions();
    setConflict(false);
  };
  // Xong / Duyệt / Yêu cầu sửa (C7). Endpoint chưa gộp thì trả 501 – báo gọn bằng toast.
  const approval = async (action: "done" | "approve" | "request-change") => {
    if (!screen) return;
    const label = action === "done" ? "Marking as done" : action === "approve" ? "Approving" : "Requesting changes";
    const actorId = currentMemberId();
    const r = await run(label, async () => {
      try {
        if (action === "done") return await markArtifactDone("screen", screen.id, { baseRev: screen.rev, actorId });
        if (action === "approve") return await approveArtifact("screen", screen.id, { baseRev: screen.rev, actorId });
        return await requestArtifactChange("screen", screen.id, { actorId });
      } catch (e) {
        if (isConflict(e)) setConflict(true);
        throw e;
      }
    });
    if (!r) return;
    if (action === "approve" && r.git) toast(<GitOutcome git={r.git} />, r.git.pushed ? "ok" : "info");
    else toast(action === "done" ? "Marked as done – awaiting BA Lead approval" : action === "approve" ? "Screen approved" : "Changes requested", "ok");
    await reload();
  };
  const loadVersions = useCallback(() => {
    if (!screenId) return setVersions([]);
    return get<ScreenVersion[]>(`/api/screens/${screenId}/versions`).then(setVersions).catch(() => {});
  }, [screenId]);
  useEffect(() => {
    loadVersions();
    setSelected([]);
    setViewVersion(null);
    setChecked(new Set());
  }, [screenId]);

  const latest = versions[0];
  const previewing = viewVersion ? versions.find((v) => v.id === viewVersion) ?? null : null;
  const tree: UINode | null = previewing?.tree ?? screen?.tree ?? null;
  const changedIds = useMemo(() => (showChanges && !previewing && latest && latest.id === screen?.currentVersionId ? latest.changedIds : previewing?.changedIds ?? []), [showChanges, previewing, latest, screen]);
  const annotations = m.annotations.filter((a) => a.screenId === screenId);
  const openAnns = annotations.filter((a) => a.status !== "resolved");

  // ------------------------------------------------ đo vị trí các node để vẽ lớp phủ
  const rectOf = useCallback((id: string): Rect | null => {
    const el = contentRef.current?.querySelector(`[data-node-id="${CSS.escape(id)}"]`) as HTMLElement | null;
    const f = frameRef.current?.getBoundingClientRect();
    if (!el || !f) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left - f.left, y: r.top - f.top, w: r.width, h: r.height };
  }, []);

  const measure = useCallback(() => {
    const ids = new Set<string>([...selected, ...changedIds, ...(hover ? [hover] : []), ...(tree ? [tree.id] : []), ...openAnns.flatMap((a) => a.nodeIds.slice(0, 1))]);
    const next: Record<string, Rect> = {};
    for (const id of ids) {
      const r = rectOf(id);
      if (r) next[id] = r;
    }
    setRects(next);
  }, [selected, changedIds, hover, tree?.id, openAnns.map((a) => a.id + a.nodeIds[0]).join(), rectOf]);

  useLayoutEffect(() => {
    measure();
  }, [measure, tree]);
  useEffect(() => {
    const ro = new ResizeObserver(() => measure());
    if (contentRef.current) ro.observe(contentRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  // Khung bao của từng phần tử trên canvas (pixel, so với góc trên trái của trang, bỏ qua phóng to/thu nhỏ của canvas) –
  // đầu vào tọa độ cho Recursive Transformer (Li et al. 2020) ở server
  const measureLayout = () => {
    const page = contentRef.current?.querySelector('[data-node-type="Page"]') as HTMLElement | null;
    if (!page || !page.offsetWidth) return undefined;
    const pr = page.getBoundingClientRect();
    const scale = pr.width / page.offsetWidth || 1;
    const boxes: Record<string, number[]> = {};
    contentRef.current!.querySelectorAll<HTMLElement>("[data-node-id]").forEach((el) => {
      const r = el.getBoundingClientRect();
      boxes[el.dataset.nodeId!] = [(r.left - pr.left) / scale, (r.top - pr.top) / scale, (r.right - pr.left) / scale, (r.bottom - pr.top) / scale].map((v) => Math.round(v));
    });
    return { pageWidth: page.offsetWidth, boxes };
  };

  // ------------------------------------------------ gợi ý bố cục: phần tử tiếp theo sau mỗi thay đổi (debounce 500 ms)
  const selKey = selected.join(",");
  const canSuggest = layoutOn && !!screen?.currentVersionId && !previewing && mode !== "prototype";
  useEffect(() => {
    setNext(null);
    setWhich(0);
    setPick(0);
    setGapWhich(0);
    setGapPick(0);
    if (!canSuggest || complete) return;
    const t = setTimeout(() => {
      const layout = measureLayout();
      if (!layout) return;
      post<NextResult>(`/api/screens/${screen!.id}/suggestions`, { mode: "next", nodeIds: selected, layout })
        .then((r) => setNext(r))
        .catch(() => setNext(null));
    }, 500);
    return () => clearTimeout(t);
  }, [canSuggest, screen?.id, screen?.currentVersionId, selKey, !!complete]);

  const items = (next?.items ?? []).filter((e) => !dismissed.has(`${next!.versionId}:${e.parentId}`));
  const cur: NextItem | null = items[Math.min(which, items.length - 1)] ?? null;
  const curType = cur ? cur.candidates[Math.min(pick, cur.candidates.length - 1)]?.type : null;
  // Khe còn thiếu giữa các phần tử đã có (Transformer)
  const gapKey = (g: GapItem) => `${next!.versionId}:gap:${g.parentId}:${g.index}`;
  const gaps = (next?.gaps ?? []).filter((g) => !dismissed.has(gapKey(g)));
  const gap: GapItem | null = gaps[Math.min(gapWhich, gaps.length - 1)] ?? null;
  const gapCand = gap ? gap.candidates[Math.min(gapPick, gap.candidates.length - 1)] ?? null : null;
  // Mỗi mô hình một loại sự kiện để thống kê tỷ lệ chấp nhận riêng (suggestion-stats.byKind)
  const logSugg = (e: { parentId: string }, title: string, p: number, action: "shown" | "applied" | "dismissed", source: SuggestionSource = "recursive") =>
    screen && post("/api/suggestions/events", { screenId: screen.id, versionId: next?.versionId ?? complete?.versionId, kind: SOURCE_KIND[source], targetNodeId: e.parentId, title, confidence: p, action }).catch(() => {});

  // ghi "shown" một lần cho mỗi gợi ý hiển thị trên canvas
  useEffect(() => {
    if (!cur || !next || cur.eos) return;
    const key = `${next.versionId}:${cur.parentId}`;
    if (shownRef.current.has(key)) return;
    shownRef.current.add(key);
    logSugg(cur, cur.candidates[0].type, cur.candidates[0].p, "shown");
  }, [cur?.parentId, next?.versionId]);
  useEffect(() => {
    if (!gap || !next) return;
    const key = gapKey(gap);
    if (shownRef.current.has(key)) return;
    shownRef.current.add(key);
    logSugg(gap, gap.candidates[0].type, gap.pMissing, "shown", "transformer");
  }, [gap?.parentId, gap?.index, next?.versionId]);

  const acceptItems = async (versionId: string, list: { ref: string; parentId: string; index: number; type: string; sub?: string }[], source: SuggestionSource = "recursive") => {
    if (!screen) return false;
    const r = await writeScreen("Inserting elements", `/api/screens/${screen.id}/layout/accept`, { versionId, items: list, source });
    if (!r) return false;
    setShowChanges(true);
    await reload();
    await loadVersions();
    return true;
  };
  const acceptNext = async () => {
    if (!cur || !next || !curType) return;
    const c = cur.candidates.find((x) => x.type === curType)!;
    if (await acceptItems(next.versionId, [{ ref: "a", parentId: cur.parentId, index: cur.index, type: curType }])) {
      logSugg(cur, curType, c.p, "applied");
      toast(`Added ${typeName(curType)} to ${typeLabel(cur.parentLabel)} – change its text with "Ask AI to edit the design"`, "ok");
    }
  };
  const dismissNext = () => {
    if (!cur || !next) return;
    setDismissed((d) => new Set([...d, `${next.versionId}:${cur.parentId}`]));
    logSugg(cur, curType ?? "", cur.candidates[0].p, "dismissed");
    setPick(0);
  };
  const acceptGap = async () => {
    if (!gap || !next || !gapCand) return;
    if (await acceptItems(next.versionId, [{ ref: "a", parentId: gap.parentId, index: gap.index, type: gapCand.type, sub: gapCand.sub }], "transformer")) {
      logSugg(gap, gapCand.type, gap.pMissing, "applied", "transformer");
      toast(`Added ${typeName(gapCand.type)} before ${typeLabel(gap.beforeLabel)} – change its text with "Ask AI to edit the design"`, "ok");
    }
  };
  const dismissGap = () => {
    if (!gap || !next) return;
    setDismissed((d) => new Set([...d, gapKey(gap)]));
    logSugg(gap, gapCand?.type ?? "", gap.pMissing, "dismissed", "transformer");
    setGapPick(0);
  };

  // "Tự hoàn thiện bố cục" trong vùng đang chọn hoặc cả màn
  const runComplete = async () => {
    if (!screen) return;
    const layout = measureLayout();
    if (!layout) return;
    const r = await run("AI is completing the layout…", () => post<{ versionId: string; items: GenItem[] }>(`/api/screens/${screen.id}/suggestions`, { mode: "complete", nodeIds: selected, layout }));
    if (!r) return;
    if (!r.items.length) return toast("The layout already looks complete – the AI doesn't see any component to add", "info");
    setComplete({ versionId: r.versionId, items: r.items, on: new Set(r.items.map((g) => g.tempId)) });
    setPanel("suggest");
  };
  // bỏ chọn một phần tử thì bỏ luôn các phần tử con sinh trong nó
  const toggleGen = (id: string) =>
    setComplete((c) => {
      if (!c) return c;
      const on = new Set(c.on);
      const drop = (x: string) => {
        on.delete(x);
        c.items.filter((g) => g.parentId === x).forEach((g) => drop(g.tempId));
      };
      if (on.has(id)) drop(id);
      else {
        let g: GenItem | undefined = c.items.find((x) => x.tempId === id);
        while (g) {
          on.add(g.tempId);
          g = c.items.find((x) => x.tempId === g!.parentId);
        }
      }
      return { ...c, on };
    });
  const acceptComplete = async () => {
    if (!complete) return;
    const list = complete.items.filter((g) => complete.on.has(g.tempId)).map((g) => ({ ref: g.tempId, parentId: g.parentId, index: g.index, type: g.type }));
    if (!list.length) return setComplete(null);
    if (await acceptItems(complete.versionId, list)) {
      for (const g of complete.items) logSugg(g, g.type, g.p, complete.on.has(g.tempId) ? "applied" : "dismissed");
      toast(`Added ${list.length} ${list.length === 1 ? "component" : "components"} suggested by the AI`, "ok");
      setComplete(null);
    }
  };

  // sửa tay: xóa / đổi thứ tự trong container
  const manual = async (op: "remove" | "up" | "down", id: string) => {
    if (!screen) return;
    const r = await writeScreen("Updating", `/api/screens/${screen.id}/manual`, { op, id });
    if (!r) return;
    if (op === "remove") setSelected([]);
    await reload();
    await loadVersions();
  };

  // khung bao (pixel trên trang) → tọa độ khung canvas, theo vị trí và tỷ lệ hiển thị của Page
  const pageEl = () => contentRef.current?.querySelector('[data-node-type="Page"]') as HTMLElement | null;
  const ghostRect = (b: number[]): Rect | null => {
    const page = pageEl();
    const pr = tree ? rects[tree.id] : null;
    if (!page || !pr || !page.offsetWidth) return null;
    const k = pr.w / page.offsetWidth;
    return { x: pr.x + b[0] * k, y: pr.y + b[1] * k, w: Math.max(8, (b[2] - b[0]) * k), h: Math.max(8, (b[3] - b[1]) * k) };
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === "Escape") {
        if (complete) setComplete(null);
        else if (cur && !cur.eos) dismissNext();
        else if (gap) dismissGap();
        else setSelected([]);
      } else if (e.key === "Tab" && !e.shiftKey && (complete || (cur && !cur.eos) || gap) && !previewing) {
        // Tab: hoàn thành bố cục → phần tử tiếp theo (Recursive) → phần tử còn thiếu ở giữa (Transformer)
        e.preventDefault();
        complete ? acceptComplete() : cur && !cur.eos ? acceptNext() : acceptGap();
      } else if ((e.key === "Delete" || e.key === "Backspace") && selected.length === 1 && tree && selected[0] !== tree.id && !previewing) {
        e.preventDefault();
        manual("remove", selected[0]);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  // ------------------------------------------------ tương tác canvas
  const nodeFromEvent = (e: React.MouseEvent) => (e.target as HTMLElement).closest("[data-node-id]")?.getAttribute("data-node-id") ?? null;

  const onCanvasClick = (e: React.MouseEvent) => {
    if (mode !== "select") return;
    e.preventDefault();
    const id = nodeFromEvent(e);
    if (!id) return setSelected([]);
    if (e.shiftKey || e.metaKey || e.ctrlKey) setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
    else setSelected([id]);
  };

  const framePoint = (e: React.MouseEvent) => {
    const f = frameRef.current!.getBoundingClientRect();
    return { x: e.clientX - f.left, y: e.clientY - f.top };
  };
  const onOverlayDown = (e: React.MouseEvent) => {
    if (mode !== "region") return;
    const p = framePoint(e);
    setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
  };
  const onOverlayMove = (e: React.MouseEvent) => {
    if (!drag) return;
    const p = framePoint(e);
    setDrag({ ...drag, x1: p.x, y1: p.y });
  };
  const onOverlayUp = () => {
    if (!drag || !tree) return setDrag(null);
    const box = { x: Math.min(drag.x0, drag.x1), y: Math.min(drag.y0, drag.y1), w: Math.abs(drag.x1 - drag.x0), h: Math.abs(drag.y1 - drag.y0) };
    setDrag(null);
    if (box.w < 6 || box.h < 6) return;
    const inside: string[] = [];
    let smallestContainer: { id: string; area: number } | null = null;
    contentRef.current?.querySelectorAll("[data-node-id]").forEach((el) => {
      const id = el.getAttribute("data-node-id")!;
      const r = rectOf(id);
      if (!r || r.w === 0) return;
      if (r.x >= box.x - 2 && r.y >= box.y - 2 && r.x + r.w <= box.x + box.w + 2 && r.y + r.h <= box.y + box.h + 2) inside.push(id);
      if (r.x <= box.x && r.y <= box.y && r.x + r.w >= box.x + box.w && r.y + r.h >= box.y + box.h) {
        const area = r.w * r.h;
        if (!smallestContainer || area < smallestContainer.area) smallestContainer = { id, area };
      }
    });
    const picked = inside.length ? topMostIds(tree, inside) : smallestContainer ? [(smallestContainer as { id: string }).id] : [];
    setSelected(picked);
    if (picked.length) setMode("select");
  };

  const onNavigate = (target: string) => {
    const t = norm(target);
    const found = m.screens.find((s) => norm(s.name) === t || norm(String(s.tree?.props.title ?? "")) === t);
    if (found) {
      setScreenId(found.id);
      toast(`Navigated to ${found.name}`, "info");
    } else {
      toast(`Screen "${target}" does not exist yet. Create it to complete the flow.`, "info");
      setNewScreen({ name: target, prompt: `${target} screen` });
    }
  };

  // ------------------------------------------------ hành động
  // Mở hộp thoại "Màn hình mới" với tên và prompt điền sẵn (FN-60: dùng cho gợi ý màn tiếp theo)
  const openNewScreen = (initialName = "", initialPrompt = "") => setNewScreen({ name: initialName, prompt: initialPrompt });
  const createScreen = async () => {
    if (!newScreen) return;
    const r = await run("AI is designing the screen…", () => post<{ screen: { id: string } }>(`/api/modules/${m.id}/screens`, withActor(newScreen)));
    if (r) {
      setNewScreen(null);
      await reload();
      setScreenId(r.screen.id);
      toast("Screen created", "ok");
    }
  };

  const unionBox = (ids: string[]): Rect | null => {
    const rs = ids.map((id) => rectOf(id)).filter(Boolean) as Rect[];
    if (!rs.length) return null;
    const x = Math.min(...rs.map((r) => r.x));
    const y = Math.min(...rs.map((r) => r.y));
    return { x, y, w: Math.max(...rs.map((r) => r.x + r.w)) - x, h: Math.max(...rs.map((r) => r.y + r.h)) - y };
  };

  const addComment = async () => {
    if (!screen || !comment.trim()) return;
    const a = await run("Saving comment", () => post<Annotation>(`/api/screens/${screen.id}/annotations`, withActor({ nodeIds: selected, comment, bbox: unionBox(selected) })));
    if (a) {
      setComment("");
      setChecked((c) => new Set([...c, a.id]));
      await reload();
    }
  };

  const applyEdit = async () => {
    if (!screen) return;
    const ids = [...checked].filter((id) => annotations.some((a) => a.id === id));
    if (!prompt.trim() && !ids.length) return toast("Enter a change request or tick comments to include in the prompt", "err");
    const label = selected.length || ids.length ? "AI is editing the selected region…" : "AI is editing the whole screen…";
    const r = await writeScreen<any>(label, `/api/screens/${screen.id}/edit`, { prompt, nodeIds: selected, annotationIds: ids });
    if (!r) return;
    if (r.version) toast(`v${r.version.number}: ${r.summary || "Design updated"}`, "ok");
    else toast(r.summary, "info");
    if (r.rejected?.length) toast(`${r.rejected.length} ${r.rejected.length === 1 ? "operation" : "operations"} outside the selected region were blocked`, "err");
    setPrompt("");
    setChecked(new Set());
    setShowChanges(true);
    await reload();
    await loadVersions();
  };

  const revert = async (v: ScreenVersion) => {
    if (!screen) return;
    if (!(await writeScreen("Restoring", `/api/screens/${screen.id}/revert`, { versionId: v.id }))) return;
    setViewVersion(null);
    await reload();
    await loadVersions();
    toast(`Restored v${v.number} as a new version`, "ok");
  };

  const selectedNodes = tree ? selected.map((id) => findNode(tree, id)).filter(Boolean) as UINode[] : [];

  // ------------------------------------------------ render
  return (
    <div className="studio">
      {/* Cột trái: màn hình + cây thành phần */}
      <aside className="studio-left">
        <div className="side-head">
          <span>Screens ({m.screens.length})</span>
          <Btn size="sm" kind="primary" onClick={() => setNewScreen({ name: "", prompt: "" })} data-testid="new-screen">
            <Icon name="plus" size="sm" />
            New
          </Btn>
        </div>
        <div className="screen-list">
          {m.screens.map((s) => (
            <button key={s.id} className={`screen-item ${s.id === screenId ? "active" : ""}`} onClick={() => setScreenId(s.id)}>
              <span className="screen-name">{s.name}</span>
              <span className="screen-meta">
                v{s.versionNumber} <StatusBadge status={s.status} />
              </span>
            </button>
          ))}
          {!m.screens.length && <div className="muted small pad">No screens yet. Click "New" and name the screen – AI designs it from the module's SRS, FRD-NFR and user stories.</div>}
        </div>
        {screen && <RelatedTasks kind="screen" id={screen.id} />}
        {/* SCR-16 – Gợi ý tiếp theo (A9). Không tự tạo màn (BR-06): Tạo chỉ mở hộp thoại đã điền sẵn */}
        <SuggestionsPanel m={m} onCreate={openNewScreen} />
      </aside>

      {/* Canvas */}
      <section className="studio-center">
        {!screen || !tree ? (
          <Empty title="Design the first screen">
            Name the screen (and add a description if you like) – AI builds the UI from the module's SRS, FRD-NFR and user stories. Then select regions, comment and prompt to refine it.
            <div className="tpl-row">
              {TEMPLATES.map((t) => (
                <button key={t.name} className="chip" onClick={() => setNewScreen(t)}>
                  {t.name}
                </button>
              ))}
            </div>
          </Empty>
        ) : (
          <>
            <div className="toolbar">
              <div className="seg" role="group" aria-label="Mode">
                <button className={mode === "select" ? "on" : ""} onClick={() => setMode("select")} title="Click to select an element, Shift+click to select several" data-testid="mode-select">
                  Select
                </button>
                <button className={mode === "region" ? "on" : ""} onClick={() => setMode("region")} title="Drag a box to select a region" data-testid="mode-region">
                  <Icon name="target" size="sm" />
                  Region
                </button>
                <button className={mode === "prototype" ? "on" : ""} onClick={() => { setMode("prototype"); setSelected([]); }} title="Click buttons/links to navigate between screens">
                  <Icon name="play" size="sm" />
                  Preview
                </button>
              </div>
              <label className="check-inline">
                <input type="checkbox" checked={showChanges} onChange={(e) => setShowChanges(e.target.checked)} /> Highlight changes
              </label>
              <div className="spacer" />
              {others.length > 0 && <EditingBadge names={others.map((o) => o.name)} />}
              <Btn size="sm" onClick={() => run("Exporting HTML", () => download(screenHtmlUrl(screen.id)))} title="Download a static HTML page (opens in any browser, no app needed)" data-testid="export-html">
                <Icon name="download" size="sm" />
                Export HTML
              </Btn>
              <details className="menu">
                <summary className="btn btn-ghost btn-sm" aria-label="More actions" title="More actions">
                  <Icon name="more" />
                </summary>
                <div className="menu-pop">
                  <button onClick={() => setRename(screen.name)}>
                    <Icon name="edit" size="sm" /> Rename
                  </button>
                  <button onClick={() => window.open(`${screenHtmlUrl(screen.id)}?inline=1`, "_blank", "noopener")}>
                    <Icon name="external" size="sm" /> Open HTML in a new tab
                  </button>
                  <button onClick={() => run("Exporting", () => download(`/api/screens/${screen.id}/export/json`))}>
                    <Icon name="download" size="sm" /> Export JSON
                  </button>
                  <button
                    className="danger"
                    onClick={async () => {
                      if (!(await confirm({ title: `Delete screen "${screen.name}"?`, message: "The screen and all of its versions will be deleted.", okLabel: "Delete", danger: true }))) return;
                      if (!(await writeScreen("Deleting", `/api/screens/${screen.id}`, {}, "DELETE"))) return;
                      reload();
                    }}
                  >
                    <Icon name="delete" size="sm" /> Delete screen
                  </button>
                </div>
              </details>
            </div>
            <ApprovalBar
              status={screen.status}
              revisionRequested={screen.revisionRequested}
              isLead={isLead}
              onDone={() => approval("done")}
              onApprove={() => approval("approve")}
              onRequestChange={() => approval("request-change")}
              disabledReason={previewing ? "Viewing an older version" : undefined}
              testId="screen-approval"
            />
            {conflict && <ConflictNotice onReload={reloadAfterConflict} />}
            {previewing && (
              <div className="preview-banner">
                Viewing <strong>v{previewing.number}</strong> ({fmtTime(previewing.createdAt)}) – read-only.
                <Btn size="sm" kind="primary" onClick={() => revert(previewing)}>
                  Restore this version
                </Btn>
                <Btn size="sm" onClick={() => setViewVersion(null)}>
                  Back to current version
                </Btn>
              </div>
            )}
            <div className="canvas-scroll">
              <div className={`canvas-frame mode-${mode}`} ref={frameRef}>
                <div className="browser-bar">
                  <span className="dot" />
                  <span className="dot" />
                  <span className="dot" />
                  <span className="url">{screen.name}</span>
                </div>
                <div
                  className="canvas-content"
                  ref={contentRef}
                  onClick={mode === "prototype" ? undefined : onCanvasClick}
                  onMouseMove={(e) => mode === "select" && setHover(nodeFromEvent(e))}
                  onMouseLeave={() => setHover(null)}
                  data-testid="canvas"
                >
                  <Renderer node={tree} onNavigate={mode === "prototype" ? onNavigate : undefined} />
                </div>
                <div className={`overlay ${mode === "region" ? "capture" : ""}`} onMouseDown={onOverlayDown} onMouseMove={onOverlayMove} onMouseUp={onOverlayUp} onMouseLeave={onOverlayUp}>
                  {mode !== "prototype" &&
                    changedIds.map((id) => rects[id] && <div key={`c-${id}`} className="ov ov-changed" style={box(rects[id])} />)}
                  {hover && !selected.includes(hover) && rects[hover] && mode === "select" && (
                    <div className="ov ov-hover" style={box(rects[hover])}>
                      <span className="ov-tag">{tree && findNode(tree, hover) ? nodeLabel(findNode(tree, hover)!) : hover}</span>
                    </div>
                  )}
                  {selected.map((id) => rects[id] && <div key={`s-${id}`} className="ov ov-selected" style={box(rects[id])} />)}
                  {mode !== "prototype" && !complete && cur && !cur.eos && curType && (() => {
                    const r = ghostRect(cur.boxPx);
                    return (
                      r && (
                        <button className="ov ov-ghost" style={box(r)} title="Tab: accept · Esc: dismiss" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); acceptNext(); }} data-testid="ghost">
                          <span className="ghost-tag">
                            {typeName(curType)} {Math.round((cur.candidates.find((c) => c.type === curType)?.p ?? 0) * 100)}% · Tab
                          </span>
                        </button>
                      )
                    );
                  })()}
                  {mode !== "prototype" && !complete && gap && gapCand && (() => {
                    // vạch chèn ngay trên phần tử đứng sau khe còn thiếu (Transformer không dự đoán khung bao)
                    const r = rectOf(gap.beforeId);
                    return (
                      r && (
                        <button className="ov ov-gap" style={box({ x: r.x, y: r.y - 3, w: r.w, h: 6 })} title={`Insert before ${gap.beforeLabel}${cur && !cur.eos ? "" : " · Tab: accept · Esc: dismiss"}`} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); acceptGap(); }} data-testid="gap-marker">
                          <span className="ghost-tag">
                            {typeName(gapCand.type)} missing {Math.round(gap.pMissing * 100)}%
                          </span>
                        </button>
                      )
                    );
                  })()}
                  {mode !== "prototype" &&
                    complete?.items.map((g) => {
                      const r = ghostRect(g.boxPx);
                      return r && <button key={g.tempId} className={`ov ov-ghost ${complete.on.has(g.tempId) ? "" : "off"}`} style={box(r)} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); toggleGen(g.tempId); }} title="Click to toggle"><span className="ghost-tag">{typeName(g.type)}</span></button>;
                    })}
                  {mode !== "prototype" &&
                    openAnns.map((a, i) => {
                      const r = rects[a.nodeIds[0]] ?? a.bbox;
                      if (!r) return null;
                      return (
                        <button
                          key={a.id}
                          className={`pin pin-${a.status}`}
                          style={{ left: r.x + r.w - 10, top: r.y - 10 }}
                          title={`${a.author}: ${a.comment}`}
                          aria-label={`Comment ${annotations.indexOf(a) + 1} by ${a.author}`}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelected(a.nodeIds);
                            setPanel("edit");
                          }}
                        >
                          {annotations.indexOf(a) + 1}
                        </button>
                      );
                    })}
                  {drag && <div className="ov ov-drag" style={box({ x: Math.min(drag.x0, drag.x1), y: Math.min(drag.y0, drag.y1), w: Math.abs(drag.x1 - drag.x0), h: Math.abs(drag.y1 - drag.y0) })} />}
                </div>
              </div>
            </div>
            <div className="hint muted small">
              {mode === "select" && "Click to select · Shift+click to select several · Esc to clear · Delete to remove · Tab to use the suggestion"}
              {mode === "region" && "Drag to select a region – elements fully inside the box are selected"}
              {mode === "prototype" && "Click buttons/links with navigation to move between screens like a prototype"}
            </div>
          </>
        )}
      </section>

      {/* Cột phải: bình luận + prompt sửa + phiên bản */}
      {screen && tree && (
        <aside className="studio-right">
          <div className="seg seg-full">
            <button className={panel === "edit" ? "on" : ""} onClick={() => setPanel("edit")} data-testid="edit-tab">
              Edit {openAnns.length ? `(${openAnns.length})` : ""}
            </button>
            <button className={panel === "layers" ? "on" : ""} onClick={() => setPanel("layers")}>
              Layers
            </button>
            <button className={panel === "versions" ? "on" : ""} onClick={() => setPanel("versions")} data-testid="versions-tab">
              Versions ({versions.length})
            </button>
            <button className={panel === "suggest" ? "on" : ""} onClick={() => setPanel("suggest")} data-testid="suggest-tab">
              Suggest {complete ? `(${complete.on.size})` : (cur && !cur.eos) || gap ? "•" : ""}
            </button>
          </div>

          {panel === "suggest" && (
            <div className="panel-body" data-testid="suggest-panel">
              <label className="check-inline">
                <input
                  type="checkbox"
                  checked={layoutOn}
                  onChange={(e) => {
                    setLayoutOn(e.target.checked);
                    try {
                      localStorage.setItem("ba.layoutSuggest", e.target.checked ? "on" : "off");
                    } catch {
                      /* trình duyệt chặn lưu trữ */
                    }
                  }}
                  data-testid="layout-toggle"
                />{" "}
                Show suggestion previews on the screen
              </label>

              {complete ? (
                <div className="box box-accent">
                  <div className="box-title">Auto-complete layout – {complete.items.length} {complete.items.length === 1 ? "component" : "components"}</div>
                  <div className="gen-list">
                    {complete.items.map((g) => {
                      const depth = (() => {
                        let d = 0;
                        let p = complete.items.find((x) => x.tempId === g.parentId);
                        while (p) {
                          d++;
                          p = complete.items.find((x) => x.tempId === p!.parentId);
                        }
                        return d;
                      })();
                      const parent = tree ? findNode(tree, g.parentId) : null;
                      const genParent = complete.items.find((x) => x.tempId === g.parentId);
                      return (
                        <label key={g.tempId} className="gen-item" style={{ paddingLeft: 4 + depth * 14 }}>
                          <input type="checkbox" checked={complete.on.has(g.tempId)} onChange={() => toggleGen(g.tempId)} /> <strong>{typeName(g.type)}</strong>{" "}
                          <span className="muted small">in {parent ? typeLabel(nodeLabel(parent)) : `${typeName(genParent?.type)} (new)`} · confidence {Math.round(g.p * 100)}%</span>
                        </label>
                      );
                    })}
                  </div>
                  <div className="sugg-actions">
                    <Btn size="sm" kind="primary" disabled={!complete.on.size || !!previewing} onClick={acceptComplete} data-testid="accept-complete">
                      Add {complete.on.size} {complete.on.size === 1 ? "component" : "components"} (Tab)
                    </Btn>
                    <Btn size="sm" kind="ghost" onClick={() => setComplete(null)}>
                      Cancel (Esc)
                    </Btn>
                  </div>
                </div>
              ) : (
                <>
                  <div className="muted small">{selected.length ? "Suggested next component for the selected area" : "Suggested next component – select an area to see suggestions for that area only"}</div>
                  {!layoutOn ? (
                    <div className="muted small pad">Suggestions are turned off.</div>
                  ) : !next ? (
                    <div className="muted small pad">AI is analysing the layout…</div>
                  ) : !cur ? (
                    <div className="muted small pad">The layout looks complete. Select an area if you want to see which components could be added.</div>
                  ) : (
                    <div className="sugg" data-testid="suggestion">
                      <div className="sugg-head">
                        <Badge tone="blue">Suggested next</Badge>
                        <span className="sugg-title">in {typeLabel(cur.parentLabel)}</span>
                        <Badge tone="gray" title="Recursive Transformer Tree Decoder (Li et al. 2020)">Recursive</Badge>
                      </div>
                      {cur.eos && <div className="muted small">This area looks complete (confidence {Math.round(cur.pEos * 100)}%). You can still add a component below.</div>}
                      <div className="cand-list">
                        {cur.candidates.map((c, i) => (
                          <button key={c.type} className={`cand ${curType === c.type ? "on" : ""}`} onClick={() => setPick(i)} data-testid="candidate">
                            <span>{typeName(c.type)}</span>
                            <span className="cand-bar">
                              <span style={{ width: `${Math.round(c.p * 100)}%` }} />
                            </span>
                            <span className="muted small">{Math.round(c.p * 100)}%</span>
                          </button>
                        ))}
                        {!cur.eos && <div className="muted small">Chance the area is complete: {Math.round(cur.pEos * 100)}%</div>}
                      </div>
                      <div className="sugg-actions">
                        <Btn size="sm" kind="primary" disabled={!!previewing} onClick={acceptNext} data-testid="accept-next">
                          Add {typeName(curType)} {cur.eos ? "" : "(Tab)"}
                        </Btn>
                        {!cur.eos && (
                          <Btn size="sm" kind="ghost" onClick={dismissNext}>
                            Dismiss (Esc)
                          </Btn>
                        )}
                      </div>
                      {items.length > 1 && (
                        <div className="muted small">
                          Suggestions in other areas:{" "}
                          {items.map((e, i) => (
                            <React.Fragment key={e.parentId}>
                              {i > 0 && " · "}
                              <button className={`link small ${i === which ? "strong" : ""}`} onClick={() => { setWhich(i); setPick(0); }}>
                                {typeName(e.candidates[0].type)} in {typeLabel(e.parentLabel)}
                              </button>
                            </React.Fragment>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {layoutOn && next && (
                    <>
                      <div className="muted small">Missing in between – a component the AI expects before one that already exists</div>
                      {!next.gapModel ? (
                        <div className="muted small pad">The missing-element model is not available (model/next-transformer.websight.json).</div>
                      ) : !gap ? (
                        <div className="muted small pad">No missing component found between the existing ones{selected.length ? " in the selected area" : ""}.</div>
                      ) : (
                        <div className="sugg" data-testid="gap-suggestion">
                          <div className="sugg-head">
                            <Badge tone="violet">Missing</Badge>
                            <span className="sugg-title">
                              in {typeLabel(gap.parentLabel)}, before {typeLabel(gap.beforeLabel)}
                            </span>
                            <Badge tone="gray" title="Transformer missing-element detector (Li et al. 2020, bidirectional)">Transformer</Badge>
                          </div>
                          <div className="muted small">
                            {gap.afterLabel ? `Between ${typeLabel(gap.afterLabel)} and ${typeLabel(gap.beforeLabel)}` : `At the start of ${typeLabel(gap.parentLabel)}`} · confidence it is missing: {Math.round(gap.pMissing * 100)}%
                          </div>
                          <div className="cand-list">
                            {gap.candidates.map((c, i) => (
                              <button key={c.type} className={`cand ${gapCand?.type === c.type ? "on" : ""}`} onClick={() => setGapPick(i)} data-testid="gap-candidate">
                                <span>{SUB_LABEL[c.sub] ? `${typeName(c.type)} (${SUB_LABEL[c.sub]})` : typeName(c.type)}</span>
                                <span className="cand-bar">
                                  <span style={{ width: `${Math.round(c.p * 100)}%` }} />
                                </span>
                                <span className="muted small">{Math.round(c.p * 100)}%</span>
                              </button>
                            ))}
                          </div>
                          <div className="sugg-actions">
                            <Btn size="sm" disabled={!!previewing} onClick={acceptGap} data-testid="accept-gap">
                              Insert {typeName(gapCand?.type)} {cur && !cur.eos ? "" : "(Tab)"}
                            </Btn>
                            <Btn size="sm" kind="ghost" onClick={dismissGap}>
                              Dismiss{cur && !cur.eos ? "" : " (Esc)"}
                            </Btn>
                          </div>
                          {gaps.length > 1 && (
                            <div className="muted small">
                              Other gaps:{" "}
                              {gaps.map((g, i) => (
                                <React.Fragment key={`${g.parentId}:${g.index}`}>
                                  {i > 0 && " · "}
                                  <button className={`link small ${i === gapWhich ? "strong" : ""}`} onClick={() => { setGapWhich(i); setGapPick(0); }}>
                                    {typeName(g.candidates[0].type)} before {typeLabel(g.beforeLabel)}
                                  </button>
                                </React.Fragment>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                  <div className="box">
                    <div className="box-title">Auto-complete layout</div>
                    <div className="muted small">The AI proposes everything still missing {selected.length ? "in the selected region" : "on the whole screen"}. Preview it and choose which components to keep.</div>
                    <Btn size="sm" disabled={!!previewing || !layoutOn} onClick={runComplete} data-testid="run-complete">
                      <Icon name="ai" size="sm" />
                      Auto-complete layout
                    </Btn>
                  </div>
                </>
              )}
              <div className="muted small sugg-foot">
                <span title={`Models in model/ only – no rules, no Claude. Suggested next and Auto-complete layout: Recursive Transformer Tree Decoder (Li et al. 2020)${next?.model ? `, ${next.model.trees.toLocaleString("en-US")} UI trees` : ""}. Missing in between: Transformer missing-element detector${next?.gapModel ? `, ${next.gapModel.trees.toLocaleString("en-US")} UI trees` : ""}.`}>AI suggestions{next?.model ? `, learned from ${next.model.roots} business screen samples` : ""}</span>. The AI suggests component type, position and size – not the text; change text with "Ask AI to edit the design".
              </div>
            </div>
          )}

          {panel === "edit" && (
            <div className="panel-body">
              <div className="box">
                <div className="box-title">Selected region</div>
                {selectedNodes.length ? (
                  <div className="sel-list" data-testid="selection">
                    {selectedNodes.map((n) => (
                      <span key={n.id} className="chip chip-sel">
                        {nodeLabel(n)}
                        <button onClick={() => setSelected((s) => s.filter((x) => x !== n.id))} aria-label="Remove" title="Remove">
                          <Icon name="close" size="xs" />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="muted small">No region selected – the change request will apply to the whole screen.</div>
                )}
              </div>

              <div className="box">
                <div className="box-title">Comment on region</div>
                <textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={selected.length ? "E.g. Change the text to “Enter the system”" : "Select a region on the canvas, then write a comment…"} data-testid="comment-input" />
                <Btn size="sm" disabled={!comment.trim()} onClick={addComment} data-testid="add-comment">
                  <Icon name="plus" size="sm" />
                  Add comment
                </Btn>
              </div>

              <div className="box">
                <div className="box-title">
                  Comments ({annotations.length}) <span className="muted small">– tick to include in the prompt</span>
                </div>
                <div className="ann-list">
                  {annotations.map((a, i) => (
                    <div key={a.id} className={`ann ann-${a.status}`}>
                      <label className="ann-check">
                        <input
                          type="checkbox"
                          disabled={a.status === "resolved"}
                          checked={checked.has(a.id)}
                          onChange={(e) =>
                            setChecked((c) => {
                              const n = new Set(c);
                              e.target.checked ? n.add(a.id) : n.delete(a.id);
                              return n;
                            })
                          }
                          data-testid="ann-check"
                        />
                        <span className="pin-num">{i + 1}</span>
                      </label>
                      <div className="ann-main" onClick={() => setSelected(a.nodeIds.filter((id) => tree && findNode(tree, id)))}>
                        <div className="ann-text">{a.comment}</div>
                        <div className="muted small">
                          {a.nodeIds.length ? a.nodeIds.map((id) => (tree && findNode(tree, id) ? nodeLabel(findNode(tree, id)!) : `${id} (deleted)`)).join(", ") : "Whole screen"} · {a.author} · {fmtTime(a.createdAt)}
                        </div>
                      </div>
                      <div className="ann-actions">
                        <StatusBadge status={a.status} />
                        {a.status !== "resolved" ? (
                          <button className="link small" onClick={async () => { await patch(`/api/annotations/${a.id}`, { status: "resolved" }); reload(); }}>
                            Resolve
                          </button>
                        ) : (
                          <button className="link small" onClick={async () => { await patch(`/api/annotations/${a.id}`, { status: "open" }); reload(); }}>
                            Reopen
                          </button>
                        )}
                        <RowActions
                          onDelete={
                            canDeleteComment(a)
                              ? async () => {
                                  if (await run("Deleting comment", () => del(`/api/annotations/${a.id}${actorQuery()}`))) reload();
                                }
                              : undefined
                          }
                          deleteConfirm={{ title: "Delete comment?", message: a.comment }}
                          testId={`ann-${i + 1}`}
                        />
                      </div>
                    </div>
                  ))}
                  {!annotations.length && <div className="muted small">No comments yet.</div>}
                </div>
              </div>

              <div className="box box-accent">
                <div className="box-title">Ask AI to edit the design</div>
                <textarea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={selected.length ? "E.g. Add a “Sign in with Google” button below" : "E.g. Switch the layout to 2 columns"} data-testid="edit-prompt" />
                <div className="muted small">
                  Sending: {selected.length ? `${selected.length} ${selected.length === 1 ? "element" : "elements"}` : "whole screen"} · {checked.size} {checked.size === 1 ? "comment" : "comments"}{prompt.trim() ? " · 1 request" : ""}
                </div>
                <SampleBadge />
                <Btn kind="primary" disabled={!!previewing || (!prompt.trim() && !checked.size)} onClick={applyEdit} data-testid="apply-edit">
                  <Icon name="ai" size="sm" />
                  {selected.length ? "Edit selected region" : "Edit whole screen"}
                </Btn>
              </div>
            </div>
          )}

          {panel === "layers" && (
            <div className="panel-body">
              <div className="layers">
                <LayerTree node={tree} selected={selected} onPick={(id, multi) => setSelected((s) => (multi ? (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]) : [id]))} />
              </div>
              {selectedNodes.length === 1 && selectedNodes[0].id !== tree.id && (
                <div className="sugg-actions">
                  <Btn size="sm" disabled={!!previewing} onClick={() => manual("up", selectedNodes[0].id)} data-testid="move-up">
                    <Icon name="up" size="sm" />
                    Up
                  </Btn>
                  <Btn size="sm" disabled={!!previewing} onClick={() => manual("down", selectedNodes[0].id)}>
                    <Icon name="down" size="sm" />
                    Down
                  </Btn>
                  <Btn
                    size="sm"
                    kind="danger"
                    disabled={!!previewing}
                    onClick={async () => {
                      const n = selectedNodes[0];
                      if (await confirm({ title: `Delete element "${nodeLabel(n)}"?`, message: "You can restore it from the Versions tab.", okLabel: "Delete", danger: true })) manual("remove", n.id);
                    }}
                    data-testid="remove-node"
                  >
                    <Icon name="delete" size="sm" />
                    Delete element
                  </Btn>
                </div>
              )}
              {selectedNodes.length === 1 && (
                <div className="box">
                  <div className="box-title">Properties – {selectedNodes[0].id}</div>
                  <pre className="code small">{JSON.stringify(selectedNodes[0].props, null, 2)}</pre>
                </div>
              )}
            </div>
          )}

          {panel === "versions" && (
            <div className="panel-body">
              {versions.map((v) => (
                <div key={v.id} className={`ver ${v.id === screen.currentVersionId ? "ver-current" : ""} ${viewVersion === v.id ? "ver-view" : ""}`}>
                  <div className="ver-head">
                    <strong>v{v.number}</strong>
                    <Badge tone={v.kind === "generate" ? "blue" : v.kind === "revert" ? "amber" : v.kind === "layout" ? "green" : "violet"}>{v.kind === "generate" ? "Generated" : v.kind === "revert" ? "Restored" : v.kind === "layout" ? "Layout suggestion" : v.kind === "manual" ? "Manual edit" : v.scope === "region" ? "Region edit" : "Whole-screen edit"}</Badge>
                    {v.id === screen.currentVersionId && <Badge tone="green">Current</Badge>}
                    <span className="muted small right" data-testid="version-author">
                      {v.author ? `${v.author} · ` : ""}
                      {fmtTime(v.createdAt)}
                    </span>
                  </div>
                  <div className="ver-prompt">{v.prompt || "—"}</div>
                  <div className="muted small">
                    {v.changedIds.length} {v.changedIds.length === 1 ? "element" : "elements"} changed{v.selectedIds.length ? ` · region: ${v.selectedIds.join(", ")}` : ""}
                    {v.rejected.length ? ` · ${v.rejected.length} blocked` : ""}
                  </div>
                  {v.id !== screen.currentVersionId && (
                    <div className="ver-actions">
                      <button className="link small" onClick={() => setViewVersion(v.id)}>
                        View
                      </button>
                      <button className="link small" onClick={() => revert(v)}>
                        Restore
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </aside>
      )}

      {rename !== null && screen && (
        <Modal
          title="Rename screen"
          onClose={() => setRename(null)}
          footer={
            <>
              <Btn onClick={() => setRename(null)}>Cancel</Btn>
              <Btn
                kind="primary"
                disabled={!rename.trim()}
                onClick={async () => {
                  if (await writeScreen("Saving", `/api/screens/${screen.id}`, { name: rename.trim() }, "PATCH")) {
                    setRename(null);
                    reload();
                  }
                }}
                data-testid="rename-save"
              >
                Save
              </Btn>
            </>
          }
        >
          <Field label="Screen name (used for navigation between screens)">
            <input value={rename} onChange={(e) => setRename(e.target.value)} autoFocus data-testid="rename-input" />
          </Field>
        </Modal>
      )}

      {newScreen && (
        <Modal
          title="New screen"
          wide
          onClose={() => setNewScreen(null)}
          footer={
            <>
              <Btn onClick={() => setNewScreen(null)}>Cancel</Btn>
              <SampleBadge />
              <Btn kind="primary" disabled={!newScreen.prompt.trim() && !newScreen.name.trim()} onClick={createScreen} data-testid="generate-screen">
                <Icon name="ai" size="sm" />
                Generate design
              </Btn>
            </>
          }
        >
          <Field label="Screen name (used for navigation between screens)">
            <input value={newScreen.name} onChange={(e) => setNewScreen({ ...newScreen, name: e.target.value })} placeholder="E.g. Sign in" data-testid="screen-name" />
          </Field>
          <div className="muted small" data-testid="screen-context">
            AI uses the module's user stories
            {docCtx ? `, SRS (${STATUS_TEXT[docCtx.srs]}) and FRD-NFR (${STATUS_TEXT[docCtx.frd]})` : ", SRS and FRD-NFR"}.
            {docCtx && docCtx.srs === "none" && docCtx.frd === "none" ? " No documents yet – complete the Documents step first so the screen matches the requirements." : ""}
          </div>
          <Field label="Additional description (optional)" hint="Leave blank and AI designs from the screen name and documents. You can add data fields, buttons, navigation…">
            <textarea rows={6} value={newScreen.prompt} onChange={(e) => setNewScreen({ ...newScreen, prompt: e.target.value })} data-testid="screen-prompt" />
          </Field>
          <div className="tpl-row">
            <span className="muted small">Quick templates:</span>
            {TEMPLATES.map((t) => (
              <button key={t.name} className="chip" onClick={() => setNewScreen(t)}>
                {t.name}
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

const box = (r: Rect): React.CSSProperties => ({ left: r.x, top: r.y, width: r.w, height: r.h });

interface ModelInfo { kind: string; trees: number; roots: number }
type SuggestionSource = "recursive" | "transformer";
/** Loại sự kiện gợi ý theo mô hình: "layout" giữ như cũ cho Recursive để không lệch thống kê đã có. */
const SOURCE_KIND: Record<SuggestionSource, string> = { recursive: "layout", transformer: "layout:transformer" };
/** Nhãn loại con mang nghĩa của Transformer (shared/transformer.ts SUBTYPES); loại không có nhãn thì chỉ hiện tên loại. */
const SUB_LABEL: Record<string, string> = { email: "email", password: "password", search: "search", phone: "phone", number: "number", name: "name", submit: "submit", cancel: "cancel", create: "add new", delete: "delete", auth: "sign-in link", remember: "remember me", agree: "agree to terms" };
interface NextItem { parentId: string; parentLabel: string; index: number; boxPx: number[]; leaf: boolean; candidates: { type: string; p: number }[]; pEos: number; eos: boolean }
interface GapItem { parentId: string; parentLabel: string; index: number; beforeId: string; beforeLabel: string; afterLabel: string | null; pMissing: number; candidates: { type: string; p: number; sub: string }[] }
interface NextResult { versionId: string; items: NextItem[]; model: ModelInfo; gaps: GapItem[]; gapModel: { kind: string; trees: number } | null }
interface GenItem { tempId: string; parentId: string; index: number; type: string; leaf: boolean; boxPx: number[]; p: number }

function LayerTree({ node, selected, onPick, depth = 0 }: { node: UINode; selected: string[]; onPick: (id: string, multi: boolean) => void; depth?: number }) {
  return (
    <>
      <button className={`layer ${selected.includes(node.id) ? "on" : ""}`} style={{ paddingLeft: 8 + depth * 14 }} onClick={(e) => onPick(node.id, e.shiftKey || e.metaKey || e.ctrlKey)}>
        <span className="layer-type">{node.type}</span> <span className="muted">{nodeLabel(node).replace(node.type, "").trim()}</span>
      </button>
      {(node.children ?? []).map((c) => (
        <LayerTree key={c.id} node={c} selected={selected} onPick={onPick} depth={depth + 1} />
      ))}
    </>
  );
}

