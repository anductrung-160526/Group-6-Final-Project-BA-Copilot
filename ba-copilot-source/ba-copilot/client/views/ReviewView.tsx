// Trang duyệt bộ dữ liệu "bổ sung UI": BA xem yêu cầu + màn gốc, chấm 6 tiêu chí, chọn Chấp nhận / Cần sửa / Loại,
// có thể sửa trực tiếp cây JSON. Kết quả lưu ở DB máy BA; bấm "Xuất kết quả" để gửi file JSON cho nhóm.
import React, { useEffect, useState } from "react";
import { download, get, post } from "../api.ts";
import { Btn, Empty, useUI } from "../components/ui.tsx";
import { Renderer } from "../components/Renderer.tsx";
import type { UINode } from "../../shared/design.ts";

interface Criterion { key: string; label: string }
interface ListItem { id: string; title: string; group: string; screenKind: string; domain: string; decision: string | null }
interface Detail {
  item: { id: string; group: string; screenKind: string; domain: string; permission: string; layout: string; notes?: string; tree: UINode; requirement: { title: string; actor: string; description: string; permissions: string[]; rules?: string[] } };
  review: { decision: string; criteria: Record<string, boolean>; comment: string; fixedTree: UINode | null } | null;
}

const DECISION: Record<string, { label: string; cls: string }> = {
  accept: { label: "Chấp nhận", cls: "ok" },
  fix: { label: "Cần sửa", cls: "warn" },
  reject: { label: "Loại", cls: "err" },
};
const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k) ?? "";
    } catch {
      return "";
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* bỏ qua */
    }
  },
};

export function ReviewView() {
  const { toast, run } = useUI();
  const [reviewer, setReviewer] = useState(store.get("rv.name"));
  const [no, setNo] = useState(Number(store.get("rv.no")) || 1);
  const [batch, setBatch] = useState(store.get("rv.batch") || "pilot");
  const [list, setList] = useState<{ items: ListItem[]; criteria: Criterion[]; version: string } | null>(null);
  const [cur, setCur] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [crit, setCrit] = useState<Record<string, boolean | undefined>>({});
  const [comment, setComment] = useState("");
  const [json, setJson] = useState<string | null>(null);
  const [showJson, setShowJson] = useState(false);

  const loadList = () =>
    reviewer.trim() &&
    get(`/api/dataset/assigned?reviewer=${encodeURIComponent(reviewer.trim())}&no=${no}&batch=${batch}`)
      .then((r) => {
        setList(r);
        if (!cur && r.items.length) setCur(r.items.find((x: ListItem) => !x.decision)?.id ?? r.items[0].id);
      })
      .catch((e) => toast(e.message, "err"));
  useEffect(() => {
    store.set("rv.name", reviewer);
    store.set("rv.no", String(no));
    store.set("rv.batch", batch);
    const t = setTimeout(loadList, 300);
    return () => clearTimeout(t);
  }, [reviewer, no, batch]);
  useEffect(() => {
    if (!cur || !reviewer.trim()) return;
    get<Detail>(`/api/dataset/roots/${cur}?reviewer=${encodeURIComponent(reviewer.trim())}`)
      .then((d) => {
        setDetail(d);
        setCrit(d.review?.criteria ?? {});
        setComment(d.review?.comment ?? "");
        setJson(d.review?.fixedTree ? JSON.stringify(d.review.fixedTree, null, 2) : null);
      })
      .catch((e) => toast(e.message, "err"));
  }, [cur]);

  const save = async (decision: string) => {
    let fixedTree: unknown;
    if (json !== null) {
      try {
        fixedTree = JSON.parse(json);
      } catch {
        return toast("JSON đã sửa không hợp lệ", "err");
      }
    }
    const ok = await run("Đang lưu", () => post("/api/dataset/reviews", { rootId: cur, reviewer, decision, criteria: crit, comment, fixedTree }));
    if (!ok) return;
    toast(`${cur}: ${DECISION[decision].label}`);
    const items = list?.items ?? [];
    const i = items.findIndex((x) => x.id === cur);
    await loadList();
    const next = items.slice(i + 1).find((x) => !x.decision) ?? items.find((x, j) => j !== i && !x.decision);
    if (next) setCur(next.id);
  };

  const done = list?.items.filter((x) => x.decision).length ?? 0;
  const tree = json !== null ? (() => { try { return JSON.parse(json) as UINode; } catch { return detail?.item.tree; } })() : detail?.item.tree;

  return (
    <div className="page review">
      <div className="page-head">
        <div>
          <h1>Duyệt bộ dữ liệu "bổ sung UI"</h1>
          <p className="muted">Mỗi màn gốc phải hoàn chỉnh và đúng nghiệp vụ. Các mẫu "thiếu" để huấn luyện được sinh tự động từ những màn bạn chấp nhận. Duyệt độc lập, không trao đổi đáp án với người khác.</p>
        </div>
        <Btn onClick={() => run("Đang xuất", () => download(`/api/dataset/reviews/export?reviewer=${encodeURIComponent(reviewer.trim())}`))} disabled={!reviewer.trim()}>
          Xuất kết quả
        </Btn>
      </div>
      <div className="review-who">
        <label>
          Tên người duyệt <input value={reviewer} onChange={(e) => setReviewer(e.target.value)} placeholder="VD: Nguyễn An" data-testid="rv-name" />
        </label>
        <label>
          Mã BA{" "}
          <select value={no} onChange={(e) => setNo(Number(e.target.value))} data-testid="rv-no">
            {Array.from({ length: 10 }, (_, i) => (
              <option key={i} value={i + 1}>
                BA {i + 1}
              </option>
            ))}
          </select>
        </label>
        <label>
          Đợt{" "}
          <select value={batch} onChange={(e) => setBatch(e.target.value)}>
            <option value="pilot">Đợt thử (50 màn)</option>
            <option value="main">Đợt chính</option>
          </select>
        </label>
        {list && <span className="muted small">Đã duyệt {done}/{list.items.length} · phiên bản dữ liệu {list.version}</span>}
      </div>
      {!reviewer.trim() ? (
        <Empty title="Nhập tên và mã BA để bắt đầu">Mỗi BA được giao một phần màn; ở đợt thử mỗi màn có 2 người duyệt độc lập.</Empty>
      ) : !list?.items.length ? (
        <Empty title="Chưa có màn nào trong đợt này" />
      ) : (
        <div className="review-body">
          <div className="review-list">
            {list.items.map((x) => (
              <button key={x.id} className={`review-item ${x.id === cur ? "on" : ""}`} onClick={() => setCur(x.id)} data-testid="rv-item">
                <span className="review-id">{x.id}</span>
                <span className="review-title">{x.title}</span>
                <span className={`review-dec ${x.decision ? DECISION[x.decision].cls : ""}`}>{x.decision ? DECISION[x.decision].label : "Chưa duyệt"}</span>
              </button>
            ))}
          </div>
          {detail && detail.item.id === cur && (
            <div className="review-main">
              <section className="review-req">
                <div className="review-tags">
                  {[detail.item.group, detail.item.screenKind, detail.item.domain, detail.item.layout].map((t) => (
                    <span key={t} className="tag">{t}</span>
                  ))}
                </div>
                <h2>{detail.item.requirement.title}</h2>
                <p><b>Người dùng:</b> {detail.item.requirement.actor}</p>
                <p>{detail.item.requirement.description}</p>
                <p><b>Quyền:</b> {detail.item.requirement.permissions.join("; ")}</p>
                {!!detail.item.requirement.rules?.length && (
                  <ul>{detail.item.requirement.rules.map((r) => <li key={r}>{r}</li>)}</ul>
                )}
                {detail.item.notes && <p className="muted small">Ghi chú người soạn: {detail.item.notes}</p>}
              </section>
              <section className="review-screen" data-testid="rv-screen">
                {tree && <Renderer node={tree} />}
              </section>
              <section className="review-form">
                <h3>Tiêu chí</h3>
                {list.criteria.map((c) => (
                  <div key={c.key} className="review-crit">
                    <span>{c.label}</span>
                    <span>
                      <button className={crit[c.key] === true ? "pass on" : "pass"} onClick={() => setCrit({ ...crit, [c.key]: true })}>Đạt</button>
                      <button className={crit[c.key] === false ? "fail on" : "fail"} onClick={() => setCrit({ ...crit, [c.key]: false })}>Không đạt</button>
                    </span>
                  </div>
                ))}
                <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Lý do / cần sửa gì (bắt buộc khi Cần sửa hoặc Loại). VD: thiếu nút Hủy; màn chỉ xem nhưng có nút Xóa." data-testid="rv-comment" />
                <div className="review-json">
                  <button className="link" onClick={() => setShowJson(!showJson)}>{showJson ? "Ẩn JSON" : "Xem / sửa cây JSON"}</button>
                  {showJson && (
                    <>
                      <textarea rows={14} value={json ?? JSON.stringify(detail.item.tree, null, 2)} onChange={(e) => setJson(e.target.value)} spellCheck={false} />
                      {json !== null && <button className="link" onClick={() => setJson(null)}>Bỏ bản sửa</button>}
                    </>
                  )}
                </div>
                <div className="review-actions">
                  <Btn kind="primary" onClick={() => save("accept")} disabled={list.criteria.some((c) => crit[c.key] !== true)} data-testid="rv-accept">Chấp nhận</Btn>
                  <Btn onClick={() => save("fix")} data-testid="rv-fix">Cần sửa</Btn>
                  <Btn kind="danger" onClick={() => save("reject")} data-testid="rv-reject">Loại</Btn>
                </div>
                {detail.review && <p className="muted small">Đã lưu: {DECISION[detail.review.decision].label}. Lưu lại sẽ ghi đè lần duyệt trước.</p>}
              </section>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
