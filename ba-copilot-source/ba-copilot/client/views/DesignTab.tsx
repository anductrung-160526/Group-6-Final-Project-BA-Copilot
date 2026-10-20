// Design Studio: prompt sinh màn hình, khoanh vùng (click / kéo khung), bình luận theo vùng,
// gửi bình luận vào prompt, prompt sửa theo vùng, lịch sử phiên bản, xem thử prototype,
// gợi ý bố cục (Recursive Transformer, Li et al. 2020): khung mờ phần tử tiếp theo trên canvas + "Hoàn thành bố cục".

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { get, post, patch, del, download } from "../api.ts";
import type { Annotation, ModuleDetail, ScreenVersion } from "../../shared/types.ts";
import { findNode, nodeLabel, topMostIds, UINode } from "../../shared/design.ts";
import { Renderer } from "../components/Renderer.tsx";
import { SuggestionsPanel } from "../components/SuggestionsPanel.tsx";
import { Badge, Btn, Empty, Field, Modal, StatusBadge, fmtTime, useUI } from "../components/ui.tsx";

type Mode = "select" | "region" | "prototype";
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const TEMPLATES = [
  { name: "Đăng nhập", prompt: "Màn hình đăng nhập bằng email và mật khẩu, có ghi nhớ đăng nhập, quên mật khẩu và link đăng ký." },
  { name: "Quản lý sản phẩm", prompt: "Màn hình quản lý sản phẩm: tìm kiếm theo tên, lọc theo danh mục và trạng thái, bảng danh sách có sửa/xóa, nút thêm mới, phân trang." },
  { name: "Thêm sản phẩm", prompt: "Form thêm sản phẩm: tên, mã SKU, danh mục, giá bán, số lượng tồn, mô tả, ảnh; nút Lưu và Hủy." },
  { name: "Trang chủ", prompt: "Dashboard tổng quan cho quản trị viên: các chỉ số doanh thu, đơn hàng, khách hàng mới và bảng đơn hàng gần đây." },
];

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().trim();

export function DesignTab({ m, reload }: { m: ModuleDetail; reload: () => Promise<unknown> }) {
  const { run, toast } = useUI();
  const [screenId, setScreenId] = useState<string | null>(m.screens[0]?.id ?? null);
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
  const [next, setNext] = useState<{ versionId: string; items: NextItem[]; model: ModelInfo } | null>(null);
  const [which, setWhich] = useState(0); // vị trí đang hiển thị (khi không chọn gì, tối đa 3 container)
  const [pick, setPick] = useState(0); // loại ứng viên đang chọn trong top-3
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
    if (!canSuggest || complete) return;
    const t = setTimeout(() => {
      const layout = measureLayout();
      if (!layout) return;
      post<{ versionId: string; items: NextItem[]; model: ModelInfo }>(`/api/screens/${screen!.id}/suggestions`, { mode: "next", nodeIds: selected, layout })
        .then((r) => setNext(r))
        .catch(() => setNext(null));
    }, 500);
    return () => clearTimeout(t);
  }, [canSuggest, screen?.id, screen?.currentVersionId, selKey, !!complete]);

  const items = (next?.items ?? []).filter((e) => !dismissed.has(`${next!.versionId}:${e.parentId}`));
  const cur: NextItem | null = items[Math.min(which, items.length - 1)] ?? null;
  const curType = cur ? cur.candidates[Math.min(pick, cur.candidates.length - 1)]?.type : null;
  const logSugg = (e: { parentId: string }, title: string, p: number, action: "shown" | "applied" | "dismissed") =>
    screen && post("/api/suggestions/events", { screenId: screen.id, versionId: next?.versionId ?? complete?.versionId, kind: "layout", targetNodeId: e.parentId, title, confidence: p, action }).catch(() => {});

  // ghi "shown" một lần cho mỗi gợi ý hiển thị trên canvas
  useEffect(() => {
    if (!cur || !next || cur.eos) return;
    const key = `${next.versionId}:${cur.parentId}`;
    if (shownRef.current.has(key)) return;
    shownRef.current.add(key);
    logSugg(cur, cur.candidates[0].type, cur.candidates[0].p, "shown");
  }, [cur?.parentId, next?.versionId]);

  const acceptItems = async (versionId: string, list: { ref: string; parentId: string; index: number; type: string }[]) => {
    if (!screen) return false;
    const r = await run("Đang chèn phần tử", () => post(`/api/screens/${screen.id}/layout/accept`, { versionId, items: list }));
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
      toast(`Đã thêm ${curType} vào ${cur.parentLabel} – đổi nội dung bằng Prompt sửa thiết kế`, "ok");
    }
  };
  const dismissNext = () => {
    if (!cur || !next) return;
    setDismissed((d) => new Set([...d, `${next.versionId}:${cur.parentId}`]));
    logSugg(cur, curType ?? "", cur.candidates[0].p, "dismissed");
    setPick(0);
  };

  // "Hoàn thành bố cục" trong vùng đang chọn hoặc cả màn
  const runComplete = async () => {
    if (!screen) return;
    const layout = measureLayout();
    if (!layout) return;
    const r = await run("Mô hình đang hoàn thành bố cục…", () => post<{ versionId: string; items: GenItem[] }>(`/api/screens/${screen.id}/suggestions`, { mode: "complete", nodeIds: selected, layout }));
    if (!r) return;
    if (!r.items.length) return toast("Mô hình cho rằng bố cục đã đủ (EOS ở mọi container)", "info");
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
      toast(`Đã thêm ${list.length} phần tử theo gợi ý bố cục`, "ok");
      setComplete(null);
    }
  };

  // sửa tay: xóa / đổi thứ tự trong container
  const manual = async (op: "remove" | "up" | "down", id: string) => {
    if (!screen) return;
    const r = await run("Đang cập nhật", () => post(`/api/screens/${screen.id}/manual`, { op, id }));
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
        else setSelected([]);
      } else if (e.key === "Tab" && !e.shiftKey && (complete || (cur && !cur.eos)) && !previewing) {
        e.preventDefault();
        complete ? acceptComplete() : acceptNext();
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
      toast(`→ ${found.name}`, "info");
    } else {
      toast(`Chưa có màn hình "${target}". Tạo mới để hoàn thiện luồng.`, "info");
      setNewScreen({ name: target, prompt: `Màn hình ${target}` });
    }
  };

  // ------------------------------------------------ hành động
  // Mở hộp thoại "Màn hình mới" với tên và prompt điền sẵn (FN-60: dùng cho gợi ý màn tiếp theo)
  const openNewScreen = (initialName = "", initialPrompt = "") => setNewScreen({ name: initialName, prompt: initialPrompt });
  const createScreen = async () => {
    if (!newScreen) return;
    const r = await run("AI đang thiết kế màn hình…", () => post(`/api/modules/${m.id}/screens`, newScreen));
    if (r) {
      setNewScreen(null);
      await reload();
      setScreenId(r.screen.id);
      toast("Đã tạo màn hình", "ok");
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
    const a = await run("Đang lưu bình luận", () => post<Annotation>(`/api/screens/${screen.id}/annotations`, { nodeIds: selected, comment, bbox: unionBox(selected) }));
    if (a) {
      setComment("");
      setChecked((c) => new Set([...c, a.id]));
      await reload();
    }
  };

  const applyEdit = async () => {
    if (!screen) return;
    const ids = [...checked].filter((id) => annotations.some((a) => a.id === id));
    if (!prompt.trim() && !ids.length) return toast("Nhập yêu cầu sửa hoặc tick bình luận để gửi vào prompt", "err");
    const label = selected.length || ids.length ? "AI đang sửa vùng đã khoanh…" : "AI đang sửa toàn màn hình…";
    const r = await run(label, () => post(`/api/screens/${screen.id}/edit`, { prompt, nodeIds: selected, annotationIds: ids }));
    if (!r) return;
    if (r.version) toast(`v${r.version.number}: ${r.summary || "Đã cập nhật thiết kế"}`, "ok");
    else toast(r.summary, "info");
    if (r.rejected?.length) toast(`${r.rejected.length} thao tác ngoài vùng khoanh đã bị chặn`, "err");
    setPrompt("");
    setChecked(new Set());
    setShowChanges(true);
    await reload();
    await loadVersions();
  };

  const approve = async (approved: boolean) => {
    if (!screen) return;
    if (!approved && m.docsStatus !== "none" && !confirm("Bỏ duyệt sẽ chuyển tài liệu và test hiện có sang Lỗi thời. Tiếp tục?")) return;
    await run("Đang cập nhật", () => post(`/api/screens/${screen.id}/approve`, { approved }));
    await reload();
    toast(approved ? "Đã duyệt thiết kế – có thể sinh tài liệu" : "Đã chuyển về bản nháp", "ok");
  };

  const revert = async (v: ScreenVersion) => {
    if (!screen) return;
    await run("Đang khôi phục", () => post(`/api/screens/${screen.id}/revert`, { versionId: v.id }));
    setViewVersion(null);
    await reload();
    await loadVersions();
    toast(`Đã khôi phục v${v.number} thành phiên bản mới`, "ok");
  };

  const selectedNodes = tree ? selected.map((id) => findNode(tree, id)).filter(Boolean) as UINode[] : [];

  // ------------------------------------------------ render
  return (
    <div className="studio">
      {/* Cột trái: màn hình + cây thành phần */}
      <aside className="studio-left">
        <div className="side-head">
          <span>Màn hình ({m.screens.length})</span>
          <Btn size="sm" kind="primary" onClick={() => setNewScreen({ name: "", prompt: "" })} data-testid="new-screen">
            + Mới
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
          {!m.screens.length && <div className="muted small pad">Chưa có màn hình. Bấm "+ Mới" và mô tả màn hình bằng prompt.</div>}
        </div>
        {/* SCR-16 – Gợi ý tiếp theo (A9). Không tự tạo màn (BR-06): Tạo chỉ mở hộp thoại đã điền sẵn */}
        <SuggestionsPanel m={m} onCreate={openNewScreen} />
      </aside>

      {/* Canvas */}
      <section className="studio-center">
        {!screen || !tree ? (
          <Empty title="Bắt đầu bằng một prompt">
            Mô tả màn hình cần thiết kế, AI sẽ dựng giao diện. Sau đó khoanh vùng, bình luận và prompt để sửa.
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
              <div className="seg" role="group" aria-label="Chế độ">
                <button className={mode === "select" ? "on" : ""} onClick={() => setMode("select")} title="Click để chọn phần tử, Shift+click để chọn nhiều" data-testid="mode-select">
                  ⌖ Chọn
                </button>
                <button className={mode === "region" ? "on" : ""} onClick={() => setMode("region")} title="Kéo khung để khoanh vùng" data-testid="mode-region">
                  ⬚ Khoanh vùng
                </button>
                <button className={mode === "prototype" ? "on" : ""} onClick={() => { setMode("prototype"); setSelected([]); }} title="Bấm nút/link để chuyển màn hình">
                  ▶ Xem thử
                </button>
              </div>
              <label className="check-inline">
                <input type="checkbox" checked={showChanges} onChange={(e) => setShowChanges(e.target.checked)} /> Tô thay đổi
              </label>
              <div className="spacer" />
              <StatusBadge status={screen.status} />
              {screen.status === "approved" ? (
                <Btn size="sm" onClick={() => approve(false)}>
                  Bỏ duyệt
                </Btn>
              ) : (
                <Btn size="sm" kind="primary" onClick={() => approve(true)} data-testid="approve-screen">
                  ✓ Duyệt thiết kế
                </Btn>
              )}
              <details className="menu">
                <summary className="btn btn-ghost btn-sm">⋯</summary>
                <div className="menu-pop">
                  <button
                    onClick={async () => {
                      const name = window.prompt("Tên màn hình", screen.name);
                      if (name) {
                        await run("Đang lưu", () => patch(`/api/screens/${screen.id}`, { name }));
                        reload();
                      }
                    }}
                  >
                    Đổi tên
                  </button>
                  <button onClick={() => run("Đang xuất", () => download(`/api/screens/${screen.id}/export/json`))}>Xuất JSON</button>
                  <button
                    className="danger"
                    onClick={async () => {
                      if (!confirm(`Xóa màn hình "${screen.name}"?`)) return;
                      await run("Đang xóa", () => del(`/api/screens/${screen.id}`));
                      reload();
                    }}
                  >
                    Xóa màn hình
                  </button>
                </div>
              </details>
            </div>
            {previewing && (
              <div className="preview-banner">
                Đang xem <strong>v{previewing.number}</strong> ({fmtTime(previewing.createdAt)}) – chỉ đọc.
                <Btn size="sm" kind="primary" onClick={() => revert(previewing)}>
                  Khôi phục phiên bản này
                </Btn>
                <Btn size="sm" onClick={() => setViewVersion(null)}>
                  Về bản hiện tại
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
                        <button className="ov ov-ghost" style={box(r)} title="Tab: chấp nhận · Esc: bỏ qua" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); acceptNext(); }} data-testid="ghost">
                          <span className="ghost-tag">
                            {curType} {Math.round((cur.candidates.find((c) => c.type === curType)?.p ?? 0) * 100)}% · Tab
                          </span>
                        </button>
                      )
                    );
                  })()}
                  {mode !== "prototype" &&
                    complete?.items.map((g) => {
                      const r = ghostRect(g.boxPx);
                      return r && <button key={g.tempId} className={`ov ov-ghost ${complete.on.has(g.tempId) ? "" : "off"}`} style={box(r)} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); toggleGen(g.tempId); }} title="Bấm để bỏ/chọn"><span className="ghost-tag">{g.type}</span></button>;
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
                          aria-label={`Bình luận ${annotations.indexOf(a) + 1} của ${a.author}`}
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
              {mode === "select" && "Click để chọn phần tử · Shift+click chọn nhiều · Esc bỏ chọn · Delete xóa phần tử · Tab chấp nhận khung mờ gợi ý"}
              {mode === "region" && "Kéo chuột để khoanh vùng – các phần tử nằm trọn trong khung sẽ được chọn"}
              {mode === "prototype" && "Bấm nút/liên kết có điều hướng để chuyển màn hình như prototype"}
            </div>
          </>
        )}
      </section>

      {/* Cột phải: bình luận + prompt sửa + phiên bản */}
      {screen && tree && (
        <aside className="studio-right">
          <div className="seg seg-full">
            <button className={panel === "edit" ? "on" : ""} onClick={() => setPanel("edit")}>
              Sửa {openAnns.length ? `(${openAnns.length})` : ""}
            </button>
            <button className={panel === "layers" ? "on" : ""} onClick={() => setPanel("layers")}>
              Thành phần
            </button>
            <button className={panel === "versions" ? "on" : ""} onClick={() => setPanel("versions")} data-testid="versions-tab">
              Phiên bản ({versions.length})
            </button>
            <button className={panel === "suggest" ? "on" : ""} onClick={() => setPanel("suggest")} data-testid="suggest-tab">
              Gợi ý {complete ? `(${complete.on.size})` : cur && !cur.eos ? "•" : ""}
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
                Hiện khung mờ phần tử tiếp theo trên canvas
              </label>

              {complete ? (
                <div className="box box-accent">
                  <div className="box-title">Hoàn thành bố cục – {complete.items.length} phần tử</div>
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
                          <input type="checkbox" checked={complete.on.has(g.tempId)} onChange={() => toggleGen(g.tempId)} /> <strong>{g.type}</strong>{" "}
                          <span className="muted small">trong {parent ? nodeLabel(parent) : `${genParent?.type ?? ""} (mới)`} · {Math.round(g.p * 100)}%</span>
                        </label>
                      );
                    })}
                  </div>
                  <div className="sugg-actions">
                    <Btn size="sm" kind="primary" disabled={!complete.on.size || !!previewing} onClick={acceptComplete} data-testid="accept-complete">
                      Chấp nhận {complete.on.size} phần tử (Tab)
                    </Btn>
                    <Btn size="sm" kind="ghost" onClick={() => setComplete(null)}>
                      Hủy (Esc)
                    </Btn>
                  </div>
                </div>
              ) : (
                <>
                  <div className="muted small">{selected.length ? "Phần tử tiếp theo trong container đang chọn" : "Phần tử tiếp theo – chọn một container để hỏi riêng vị trí đó"}</div>
                  {!layoutOn ? (
                    <div className="muted small pad">Đang tắt gợi ý.</div>
                  ) : !next ? (
                    <div className="muted small pad">Đang tính…</div>
                  ) : !cur ? (
                    <div className="muted small pad">Mô hình cho rằng bố cục đã đủ (dự đoán EOS ở mọi container). Chọn một container để xem các loại phần tử có thể thêm.</div>
                  ) : (
                    <div className="sugg" data-testid="suggestion">
                      <div className="sugg-head">
                        <Badge tone="blue">Tiếp theo</Badge>
                        <span className="sugg-title">trong {cur.parentLabel}</span>
                      </div>
                      {cur.eos && <div className="muted small">Mô hình cho rằng container này đã đủ (EOS {Math.round(cur.pEos * 100)}%). Có thể vẫn chọn một loại bên dưới.</div>}
                      <div className="cand-list">
                        {cur.candidates.map((c, i) => (
                          <button key={c.type} className={`cand ${curType === c.type ? "on" : ""}`} onClick={() => setPick(i)} data-testid="candidate">
                            <span>{c.type}</span>
                            <span className="cand-bar">
                              <span style={{ width: `${Math.round(c.p * 100)}%` }} />
                            </span>
                            <span className="muted small">{Math.round(c.p * 100)}%</span>
                          </button>
                        ))}
                        {!cur.eos && <div className="muted small">Kết thúc (EOS): {Math.round(cur.pEos * 100)}%</div>}
                      </div>
                      <div className="sugg-actions">
                        <Btn size="sm" kind="primary" disabled={!!previewing} onClick={acceptNext} data-testid="accept-next">
                          Thêm {curType} {cur.eos ? "" : "(Tab)"}
                        </Btn>
                        {!cur.eos && (
                          <Btn size="sm" kind="ghost" onClick={dismissNext}>
                            Bỏ qua (Esc)
                          </Btn>
                        )}
                      </div>
                      {items.length > 1 && (
                        <div className="muted small">
                          Vị trí khác:{" "}
                          {items.map((e, i) => (
                            <React.Fragment key={e.parentId}>
                              {i > 0 && " · "}
                              <button className={`link small ${i === which ? "strong" : ""}`} onClick={() => { setWhich(i); setPick(0); }}>
                                {e.candidates[0].type} trong {e.parentLabel}
                              </button>
                            </React.Fragment>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="box">
                    <div className="box-title">Hoàn thành bố cục</div>
                    <div className="muted small">Mô hình sinh tiếp toàn bộ phần còn thiếu {selected.length ? "trong vùng đang chọn" : "của cả màn"}, hiện thành khung mờ để chấp nhận từng phần.</div>
                    <Btn size="sm" disabled={!!previewing || !layoutOn} onClick={runComplete} data-testid="run-complete">
                      ✦ Hoàn thành bố cục
                    </Btn>
                  </div>
                </>
              )}
              <div className="muted small sugg-foot">
                Recursive Transformer Tree Decoder (Li et al. 2020){next?.model ? ` · học từ ${next.model.trees.toLocaleString("vi-VN")} cây giao diện (${next.model.roots} màn gốc)` : ""}. Gợi ý gồm loại, vị trí và kích thước phần tử – không gồm nội dung; đổi chữ bằng Prompt sửa thiết kế.
              </div>
            </div>
          )}

          {panel === "edit" && (
            <div className="panel-body">
              <div className="box">
                <div className="box-title">Vùng đang chọn</div>
                {selectedNodes.length ? (
                  <div className="sel-list" data-testid="selection">
                    {selectedNodes.map((n) => (
                      <span key={n.id} className="chip chip-sel">
                        {nodeLabel(n)}
                        <button onClick={() => setSelected((s) => s.filter((x) => x !== n.id))} aria-label="Bỏ">
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="muted small">Chưa khoanh vùng – yêu cầu sửa sẽ áp dụng cho toàn màn hình.</div>
                )}
              </div>

              <div className="box">
                <div className="box-title">Bình luận vào vùng</div>
                <textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={selected.length ? "VD: Đổi chữ thành “Vào hệ thống”" : "Chọn vùng trên canvas rồi ghi bình luận…"} data-testid="comment-input" />
                <Btn size="sm" disabled={!comment.trim()} onClick={addComment} data-testid="add-comment">
                  + Thêm bình luận
                </Btn>
              </div>

              <div className="box">
                <div className="box-title">
                  Bình luận ({annotations.length}) <span className="muted small">– tick để gửi vào prompt</span>
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
                          {a.nodeIds.length ? a.nodeIds.map((id) => (tree && findNode(tree, id) ? nodeLabel(findNode(tree, id)!) : `${id} (đã xóa)`)).join(", ") : "Toàn màn hình"} · {a.author} · {fmtTime(a.createdAt)}
                        </div>
                      </div>
                      <div className="ann-actions">
                        <StatusBadge status={a.status} />
                        {a.status !== "resolved" ? (
                          <button className="link small" onClick={async () => { await patch(`/api/annotations/${a.id}`, { status: "resolved" }); reload(); }}>
                            Xong
                          </button>
                        ) : (
                          <button className="link small" onClick={async () => { await patch(`/api/annotations/${a.id}`, { status: "open" }); reload(); }}>
                            Mở lại
                          </button>
                        )}
                        <button className="link-danger small" onClick={async () => { await del(`/api/annotations/${a.id}`); reload(); }}>
                          Xóa
                        </button>
                      </div>
                    </div>
                  ))}
                  {!annotations.length && <div className="muted small">Chưa có bình luận.</div>}
                </div>
              </div>

              <div className="box box-accent">
                <div className="box-title">Prompt sửa thiết kế</div>
                <textarea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={selected.length ? "VD: Thêm nút “Đăng nhập bằng Google” bên dưới" : "VD: Chuyển bố cục sang 2 cột"} data-testid="edit-prompt" />
                <div className="muted small">
                  Gửi: {selected.length ? `${selected.length} vùng` : "toàn màn hình"} · {checked.size} bình luận{prompt.trim() ? " · 1 yêu cầu" : ""}
                </div>
                <Btn kind="primary" disabled={!!previewing || (!prompt.trim() && !checked.size)} onClick={applyEdit} data-testid="apply-edit">
                  {selected.length ? "✦ Sửa vùng đã khoanh" : "✦ Sửa toàn màn hình"}
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
                    ↑ Lên
                  </Btn>
                  <Btn size="sm" disabled={!!previewing} onClick={() => manual("down", selectedNodes[0].id)}>
                    ↓ Xuống
                  </Btn>
                  <Btn size="sm" kind="danger" disabled={!!previewing} onClick={() => manual("remove", selectedNodes[0].id)} data-testid="remove-node">
                    Xóa phần tử
                  </Btn>
                </div>
              )}
              {selectedNodes.length === 1 && (
                <div className="box">
                  <div className="box-title">Thuộc tính – {selectedNodes[0].id}</div>
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
                    <Badge tone={v.kind === "generate" ? "blue" : v.kind === "revert" ? "amber" : v.kind === "layout" ? "green" : "violet"}>{v.kind === "generate" ? "Sinh mới" : v.kind === "revert" ? "Khôi phục" : v.kind === "layout" ? "Gợi ý bố cục" : v.kind === "manual" ? "Sửa tay" : v.scope === "region" ? "Sửa theo vùng" : "Sửa toàn màn hình"}</Badge>
                    {v.id === screen.currentVersionId && <Badge tone="green">Hiện tại</Badge>}
                    <span className="muted small right" data-testid="version-author">
                      {v.author ? `${v.author} · ` : ""}
                      {fmtTime(v.createdAt)}
                    </span>
                  </div>
                  <div className="ver-prompt">{v.prompt || "—"}</div>
                  <div className="muted small">
                    {v.changedIds.length} phần tử thay đổi{v.selectedIds.length ? ` · vùng: ${v.selectedIds.join(", ")}` : ""}
                    {v.rejected.length ? ` · ${v.rejected.length} thao tác bị chặn` : ""}
                  </div>
                  {v.id !== screen.currentVersionId && (
                    <div className="ver-actions">
                      <button className="link small" onClick={() => setViewVersion(v.id)}>
                        Xem
                      </button>
                      <button className="link small" onClick={() => revert(v)}>
                        Khôi phục
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </aside>
      )}

      {newScreen && (
        <Modal
          title="Màn hình mới"
          wide
          onClose={() => setNewScreen(null)}
          footer={
            <>
              <Btn onClick={() => setNewScreen(null)}>Hủy</Btn>
              <Btn kind="primary" disabled={!newScreen.prompt.trim()} onClick={createScreen} data-testid="generate-screen">
                ✦ Sinh thiết kế
              </Btn>
            </>
          }
        >
          <Field label="Tên màn hình (dùng cho điều hướng giữa các màn hình)">
            <input value={newScreen.name} onChange={(e) => setNewScreen({ ...newScreen, name: e.target.value })} placeholder="VD: Đăng nhập" data-testid="screen-name" />
          </Field>
          <Field label="Prompt mô tả màn hình" hint="Mô tả mục đích, các trường dữ liệu, nút bấm, ràng buộc, điều hướng…">
            <textarea rows={6} value={newScreen.prompt} onChange={(e) => setNewScreen({ ...newScreen, prompt: e.target.value })} data-testid="screen-prompt" />
          </Field>
          <div className="tpl-row">
            <span className="muted small">Mẫu nhanh:</span>
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
interface NextItem { parentId: string; parentLabel: string; index: number; boxPx: number[]; leaf: boolean; candidates: { type: string; p: number }[]; pEos: number; eos: boolean }
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

