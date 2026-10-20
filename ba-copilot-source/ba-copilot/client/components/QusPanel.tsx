// SCR-15 – Panel chất lượng QUS, dùng chung trong popup Tạo module (FN-53) và Sửa yêu cầu (FN-54).
// Chấm ngay trên trình duyệt bằng shared/qus.ts, chờ 300 ms sau lần gõ cuối. Chỉ mang tính tư vấn (BR-05): không chặn lưu module.

import React, { useEffect, useMemo, useState } from "react";
import { qusRating, scoreStories, type OtherModuleStories, type QusIssue, type StoryScore } from "../../shared/qus.ts";
import { Empty, IssueList, ScoreBadge, type IssueItem } from "./ui.tsx";

const DEBOUNCE_MS = 300;
const SEVERITY_LABEL: Record<QusIssue["severity"], string> = { error: "lỗi", warn: "cảnh báo", info: "gợi ý" };

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setV(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return v;
}

// Bấm chuột hoặc Enter / Space trên một dòng có role="button".
const pressable = (onPress: () => void) => ({
  role: "button",
  tabIndex: 0,
  onClick: onPress,
  onKeyDown: (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onPress();
    }
  },
});

const toIssueItem = (i: QusIssue): IssueItem => ({ severity: i.severity, code: `${i.code} (${SEVERITY_LABEL[i.severity]})`, message: i.message, suggestion: i.suggestion });
const preview = (t: string) => (t.length > 80 ? t.slice(0, 77) + "…" : t);
// Mặc định bung story có lỗi hoặc cảnh báo, thu story chỉ có gợi ý hoặc đạt chuẩn.
const openByDefault = (s: StoryScore) => s.issues.some((i) => i.severity !== "info");

export function QusPanel({ text, others }: { text: string; others?: OtherModuleStories[] }) {
  const debounced = useDebounced(text, DEBOUNCE_MS);
  const result = useMemo(() => scoreStories(debounced, { others }), [debounced, others]);
  // Trạng thái bung/thu do BA chọn, theo số thứ tự story (#1, #2…).
  const [picked, setPicked] = useState<Record<number, boolean>>({});

  if (result.stories.length === 0) {
    return (
      <div data-testid="qus-panel">
        <Empty title="Chưa có user story để chấm">Mỗi dòng một story, ví dụ: "Là khách hàng, tôi muốn xem lịch sử đơn hàng để theo dõi giao hàng."</Empty>
      </div>
    );
  }

  const isOpen = (s: StoryScore) => picked[s.index] ?? openByDefault(s);
  const allOpen = result.stories.every(isOpen);
  const setAll = (open: boolean) => setPicked(Object.fromEntries(result.stories.map((s) => [s.index, open])));

  const all = result.stories.flatMap((s) => s.issues);
  const count = (sev: QusIssue["severity"]) => all.filter((i) => i.severity === sev).length;

  return (
    <div className="qus-panel" data-testid="qus-panel">
      <div className="qus-head" aria-expanded={allOpen} {...pressable(() => setAll(!allOpen))}>
        <div>
          <div className="qus-title-wrap">
            <span>Chất lượng yêu cầu</span>
            <ScoreBadge score={result.total} testId="qus-total" />
          </div>
          <div className="muted small" data-testid="qus-summary">
            {result.stories.length} story · {count("error")} lỗi · {count("warn")} cảnh báo · {count("info")} gợi ý
            {qusRating(result.total) === "poor" && " · Điểm chỉ để tham khảo, vẫn lưu được."}
          </div>
        </div>
        <span className="muted small">{allOpen ? "Thu gọn tất cả ▲" : "Bung tất cả ▼"}</span>
      </div>

      <div className="qus-body">
        {result.stories.map((s) => {
          const open = isOpen(s);
          return (
            <div key={s.index} className="qus-story-item" data-testid="qus-story">
              <div
                className="qus-story-head"
                aria-expanded={open}
                {...pressable(() => setPicked((p) => ({ ...p, [s.index]: !open })))}
              >
                <div className="qus-story-title">
                  <span className="muted">{open ? "▾" : "▸"}</span>
                  <span className="strong">#{s.index}</span>
                  <span className="qus-story-text" title={s.text}>
                    "{open ? s.text : preview(s.text)}"
                  </span>
                </div>
                <ScoreBadge score={s.score} showLabel={false} />
              </div>
              {open && <IssueList issues={s.issues.map(toIssueItem)} empty="✓ Đạt chuẩn QUS" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
