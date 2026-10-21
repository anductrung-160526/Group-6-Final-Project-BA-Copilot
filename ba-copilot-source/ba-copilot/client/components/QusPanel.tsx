// SCR-15 – Chất lượng QUS. Chủ sở hữu: A8 → C4.
// - QusPanel: panel trên văn bản tự do (popup Tạo module / Sửa yêu cầu cũ – còn tới khi C3 bỏ ô yêu cầu cũ).
// - Đợt 5: QusToggle + QusDetail (điểm + lỗi theo từng dòng user story), QusSummary (điểm tổng của module) cho màn
//   Yêu cầu nghiệp vụ; điểm tính bằng scoreStructured() trong shared/qus.ts.
// Chấm ngay trên trình duyệt, chỉ mang tính tư vấn (BR-05): không chặn lưu.

import { useAqusa } from "../useAqusa.ts";
import React, { useEffect, useMemo, useState } from "react";
import { qusRating, scoreStories, type OtherModuleStories, type QusIssue, type QusResult, type StoryScore } from "../../shared/qus.ts";
import { Empty, Icon, IssueList, ScoreBadge, type IssueItem } from "./ui.tsx";

const DEBOUNCE_MS = 300;
const SEVERITY_LABEL: Record<QusIssue["severity"], string> = { error: "error", warn: "warning", info: "suggestion" };

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

export const toIssueItem = (i: QusIssue): IssueItem => ({ severity: i.severity, code: `${i.code} (${SEVERITY_LABEL[i.severity]})`, message: i.message, suggestion: i.suggestion });
const preview = (t: string) => (t.length > 80 ? t.slice(0, 77) + "…" : t);
// Mặc định bung story có lỗi hoặc cảnh báo, thu story chỉ có gợi ý hoặc đạt chuẩn.
const openByDefault = (s: StoryScore) => s.issues.some((i) => i.severity !== "info");

export function QusPanel({ text, others }: { text: string; others?: OtherModuleStories[] }) {
  const debounced = useDebounced(text, DEBOUNCE_MS);
  const nlpOn = useAqusa();
  const result = useMemo(() => scoreStories(debounced, { others }), [debounced, others, nlpOn]);
  // Trạng thái bung/thu do BA chọn, theo số thứ tự story (#1, #2…).
  const [picked, setPicked] = useState<Record<number, boolean>>({});

  if (result.stories.length === 0) {
    return (
      <div data-testid="qus-panel">
        <Empty title="No user stories to score yet">One story per line, for example: "As a customer, I want to view my order history so that I can track deliveries."</Empty>
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
            <span>Requirement quality</span>
            <ScoreBadge score={result.total} testId="qus-total" />
          </div>
          <div className="muted small" data-testid="qus-summary">
            {result.stories.length} {result.stories.length === 1 ? "story" : "stories"} · {count("error")} errors · {count("warn")} warnings · {count("info")} suggestions
            {qusRating(result.total) === "poor" && " · The score is for reference only; you can still save."}
          </div>
        </div>
        <span className="muted small">
          {allOpen ? "Collapse all" : "Expand all"} <Icon name={allOpen ? "chevronUp" : "chevronDown"} size="sm" />
        </span>
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
                  <span className="muted">
                    <Icon name={open ? "chevronDown" : "chevronRight"} size="sm" />
                  </span>
                  <span className="strong">#{s.index}</span>
                  <span className="qus-story-text" title={s.text}>
                    "{open ? s.text : preview(s.text)}"
                  </span>
                </div>
                <ScoreBadge score={s.score} showLabel={false} />
              </div>
              {open && <IssueList issues={s.issues.map(toIssueItem)} empty="Meets the QUS criteria" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================== Đợt 5 – QUS theo từng dòng user story (C4)

const countOf = (issues: QusIssue[], sev: QusIssue["severity"]) => issues.filter((i) => i.severity === sev).length;

/** Nút điểm QUS của một dòng story: badge điểm + mũi tên bung/thu chi tiết. Story chưa chấm (trống) → "—". */
export function QusToggle({ score, open, onToggle, testId }: { score?: StoryScore; open: boolean; onToggle: () => void; testId?: string }) {
  if (!score) return <span className="muted">—</span>;
  const n = score.issues.length;
  return (
    <button
      type="button"
      className="link nowrap"
      aria-expanded={open}
      title={n ? `${n} ${n === 1 ? "issue" : "issues"} – click to ${open ? "collapse" : "see details"}` : "Meets the QUS criteria"}
      onClick={onToggle}
      data-testid={testId}
    >
      <ScoreBadge score={score.score} showLabel={false} /> <Icon name={open ? "chevronUp" : "chevronDown"} size="sm" />
    </button>
  );
}

/** Chi tiết lỗi QUS của một story (câu đã ghép + danh sách lỗi theo mức). */
export function QusDetail({ score }: { score: StoryScore }) {
  return (
    <div className="issue-list" data-testid="qus-detail">
      <div className="muted small">Scored sentence: "{score.text}"</div>
      <IssueList issues={score.issues.map(toIssueItem)} empty="Meets the QUS criteria" />
    </div>
  );
}

/** Điểm tổng QUS của một module (trung bình các story) + số lỗi / cảnh báo / gợi ý. Không có story → không hiện. */
export function QusSummary({ result, testId = "qus-module" }: { result: QusResult; testId?: string }) {
  if (!result.stories.length) return null;
  const all = result.stories.flatMap((s) => s.issues);
  return (
    <span className="qus-title-wrap" data-testid={testId}>
      <ScoreBadge score={result.total} />
      <span className="muted small">
        QUS · {countOf(all, "error")} errors · {countOf(all, "warn")} warnings · {countOf(all, "info")} suggestions
      </span>
    </span>
  );
}
