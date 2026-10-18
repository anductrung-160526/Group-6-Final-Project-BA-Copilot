import React, { useEffect, useMemo, useState } from "react";
import { scoreStories, type QusIssue, type QusResult, type StoryScore } from "./qus.ts";

interface BadgeProps {
  tone?: "gray" | "blue" | "green" | "amber" | "red" | "violet" | string;
  children: React.ReactNode;
}

function Badge({ tone = "gray", children }: BadgeProps) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function QusPanel({ text }: { text: string }) {
  const [debouncedText, setDebouncedText] = useState(text);
  const [expanded, setExpanded] = useState(true);

  // Debounce 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedText(text);
    }, 300);
    return () => clearTimeout(timer);
  }, [text]);

  const result: QusResult = useMemo(() => scoreStories(debouncedText), [debouncedText]);

  // Text rỗng hoặc không có story: chỉ hiện gợi ý, không báo lỗi
  if (!debouncedText.trim() || result.stories.length === 0) {
    return (
      <div className="qus-panel qus-empty" data-testid="qus-panel">
        <span className="muted small">Nhập user story để xem điểm chất lượng</span>
      </div>
    );
  }

  const totalTone = result.total >= 80 ? "green" : result.total >= 50 ? "amber" : "red";

  return (
    <div className="qus-panel" data-testid="qus-panel" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      <div className="qus-head" onClick={() => setExpanded(!expanded)} role="button" tabIndex={0}>
        <div className="qus-title-wrap">
          <span>Chất lượng User Story (QUS)</span>
          <span className="muted small">· {result.stories.length} story</span>
          <span data-testid="qus-total">
            <Badge tone={totalTone}>{result.total}/100</Badge>
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

      {expanded && (
        <div className="qus-body">
          {/* Khối "Vấn đề chung" cho setIssues */}
          {result.setIssues.length > 0 && (
            <div className="qus-set-issues">
              <div className="qus-section-title">Vấn đề chung ({result.setIssues.length})</div>
              <div className="qus-issues-list">
                {result.setIssues.map((issue, idx) => (
                  <div key={idx} className={`qus-issue qus-issue-${issue.severity}`} data-testid="qus-issue">
                    <div className="qus-issue-msg">
                      <Badge tone={issue.severity === "error" ? "red" : issue.severity === "warn" ? "amber" : "blue"}>
                        {issue.code}
                      </Badge>
                      <span>{issue.message}</span>
                    </div>
                    {issue.suggestion && <div className="qus-issue-sugg">💡 {issue.suggestion}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Danh sách từng story */}
          <div className="qus-stories-section">
            <div className="qus-section-title">Chi tiết từng story</div>
            <div className="qus-stories-list">
              {result.stories.map((story: StoryScore) => {
                const sTone = story.score >= 80 ? "green" : story.score >= 50 ? "amber" : "red";
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
                      <Badge tone={sTone}>{story.score}đ</Badge>
                    </div>

                    {story.issues.length > 0 ? (
                      <div className="qus-issues-list">
                        {story.issues.map((issue: QusIssue, iIdx: number) => (
                          <div key={iIdx} className={`qus-issue qus-issue-${issue.severity}`} data-testid="qus-issue">
                            <div className="qus-issue-msg">
                              <Badge tone={issue.severity === "error" ? "red" : issue.severity === "warn" ? "amber" : "blue"}>
                                {issue.code}
                              </Badge>
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
