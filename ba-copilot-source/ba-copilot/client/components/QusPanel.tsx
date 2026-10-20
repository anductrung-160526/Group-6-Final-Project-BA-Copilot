// SCR-15 – Panel chất lượng QUS, dùng chung trong popup Tạo module và Sửa yêu cầu.
// Chỉ mang tính tư vấn (BR-05): không chặn lưu module.

import React, { useEffect, useMemo, useState } from "react";
import { qusRating, RATING_LABEL, scoreStories, type OtherModuleStories, type QusIssue, type QusResult, type StoryScore } from "../../shared/qus.ts";
import { Badge } from "./ui.tsx";

const RATING_TONE = { good: "green", fair: "amber", poor: "red" } as const;
const SEVERITY_TONE = { error: "red", warn: "amber", info: "blue" } as const;

export function QusPanel({ text, others }: { text: string; others?: OtherModuleStories[] }) {
  const [debouncedText, setDebouncedText] = useState(text);
  const [expanded, setExpanded] = useState(true);

  // Debounce 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedText(text);
    }, 300);
    return () => clearTimeout(timer);
  }, [text]);

  const result: QusResult = useMemo(() => scoreStories(debouncedText, { others }), [debouncedText, others]);

  // Text rỗng hoặc không có story: chỉ hiện trạng thái rỗng, không báo lỗi
  if (!debouncedText.trim() || result.stories.length === 0) {
    return (
      <div className="qus-panel qus-empty" data-testid="qus-panel">
        <span className="muted small">Chưa có user story để chấm</span>
      </div>
    );
  }

  const rating = qusRating(result.total);
  const all = result.stories.flatMap((s) => s.issues);
  const nErr = all.filter((i) => i.severity === "error").length;
  const nWarn = all.filter((i) => i.severity === "warn").length;
  const nInfo = all.filter((i) => i.severity === "info").length;

  return (
    <div className="qus-panel" data-testid="qus-panel">
      <div className="qus-head" onClick={() => setExpanded(!expanded)} role="button" tabIndex={0}>
        <div className="qus-title-wrap">
          <span>Chất lượng yêu cầu</span>
          <span data-testid="qus-total">
            <Badge tone={RATING_TONE[rating]}>
              {result.total}/100 {RATING_LABEL[rating]}
            </Badge>
          </span>
        </div>
        <button
          type="button"
          className="qus-toggle-btn"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
        >
          {expanded ? "Thu gọn ▲" : "Chi tiết ▼"}
        </button>
      </div>
      <div className="muted small" data-testid="qus-summary">
        {result.stories.length} story · {nErr} lỗi · {nWarn} cảnh báo · {nInfo} gợi ý
        {rating === "poor" && " · Điểm chỉ để tham khảo, vẫn lưu được."}
      </div>

      {expanded && (
        <div className="qus-body">
          <div className="qus-stories-section">
            <div className="qus-stories-list">
              {result.stories.map((story: StoryScore) => {
                const shortText = story.text.length > 90 ? story.text.slice(0, 87) + "…" : story.text;

                return (
                  <div key={story.index} className="qus-story-item">
                    <div className="qus-story-head">
                      <div className="qus-story-title">
                        <span className="strong">#{story.index}. </span>
                        <span className="qus-story-text" title={story.text}>
                          {shortText}
                        </span>
                      </div>
                      <Badge tone={RATING_TONE[qusRating(story.score)]}>{story.score}đ</Badge>
                    </div>

                    {story.issues.length > 0 ? (
                      <div className="qus-issues-list">
                        {story.issues.map((issue: QusIssue, iIdx: number) => (
                          <div key={iIdx} className={`qus-issue qus-issue-${issue.severity}`} data-testid="qus-issue">
                            <div className="qus-issue-msg">
                              <Badge tone={SEVERITY_TONE[issue.severity]}>{issue.code}</Badge>
                              <span>{issue.message}</span>
                            </div>
                            {issue.suggestion && <div className="qus-issue-sugg">💡 {issue.suggestion}</div>}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="muted small" style={{ color: "var(--green, #127a4a)" }}>
                        ✓ Đạt chuẩn QUS
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
