// SCR-16 – Khối "Gợi ý tiếp theo" ở cột trái màn Prototype (UC-29, FN-57 → FN-61). Chủ sở hữu: A9 → C9 (đợt 5).
// Link gãy do server tính mỗi lần tải; màn còn thiếu (FR / story chưa có màn) do Claude đề xuất – chỉ hỏi khi BA bấm
// "Find missing screens" (tốn lượt gọi AI), kết quả lưu theo module và báo "đã cũ" khi yêu cầu / màn đổi.
// Bỏ qua / Khôi phục lưu theo module trên server.
// Không tự tạo màn (BR-06): nút Tạo chỉ gọi onCreate để DesignTab mở hộp thoại "Màn hình mới" đã điền sẵn.

import React, { useEffect, useState } from "react";
import { dismissSuggestion, getScreenSuggestions, refreshScreenSuggestions, restoreSuggestion } from "../api.ts";
import type { ModuleDetail, ScreenSuggestion, ScreenSuggestions } from "../../../shared/types.ts";
import { Badge, Btn, fmtTime, Icon, SampleBadge, SuggestionCard, useUI } from "./ui.tsx";

// Lý do kèm nguồn (FN-59): FR và link gãy đã ghi nguồn trong lý do; story thì kèm nội dung story.
function reasonOf(s: ScreenSuggestion): React.ReactNode {
  if (s.kind !== "uncovered-story") return s.reason;
  return (
    <span className="clamp" title={s.source}>
      {s.reason}: “{s.source}”
    </span>
  );
}

export function SuggestionsPanel({ m, onCreate }: { m: ModuleDetail; onCreate: (initialName: string, initialPrompt: string) => void }) {
  const { toast, run } = useUI();
  const [data, setData] = useState<ScreenSuggestions | null>(null);
  const [showDismissed, setShowDismissed] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () =>
    getScreenSuggestions(m.id)
      .then(setData)
      .catch((e) => toast(e.message, "err"));

  // `m` đổi sau mỗi lần DesignTab gọi reload() (tạo màn, duyệt, sửa màn, sửa yêu cầu…) → tải lại gợi ý (UC-29 bước 7).
  // Đợt 5: story nằm ở bảng user_stories (không có trong ModuleDetail) → luôn hỏi server.
  useEffect(() => {
    load();
  }, [m]);

  useEffect(() => {
    if (!data?.dismissed.length) setShowDismissed(false);
  }, [data?.dismissed.length]);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (e: any) {
      toast(e.message, "err");
    } finally {
      setBusy(false);
    }
  };

  const askAi = async () => {
    setBusy(true);
    const r = await run("AI is checking which screens are still missing…", () => refreshScreenSuggestions(m.id));
    setBusy(false);
    if (r) setData(r);
  };

  // Tiền điều kiện UC-29: module có story, FR hoặc ít nhất một màn.
  if (!data || (!data.ai.hasSource && !m.screens.length && !data.items.length && !data.dismissed.length)) return null;
  const { items, dismissed, ai } = data;

  return (
    <div className="suggest-block" data-testid="suggest-block">
      <div className="side-head">
        <span>Next suggestions ({items.length})</span>
        {dismissed.length > 0 && (
          <button className="link small" onClick={() => setShowDismissed((v) => !v)} title="Show dismissed suggestions so you can restore them" data-testid="suggest-show-dismissed">
            {showDismissed ? "Collapse" : `${dismissed.length} hidden`}
          </button>
        )}
      </div>
      {ai.hasSource && (
        <div className="suggest-ai" data-testid="suggest-ai">
          {ai.checkedAt ? (
            <>
              <span className="muted small">Missing screens checked by AI · {fmtTime(ai.checkedAt)}</span>
              {ai.outdated && (
                <Badge tone="amber" title="Requirements, user stories or screens changed since the last check">
                  Outdated
                </Badge>
              )}
              <SampleBadge provider={ai.provider} />
              <button className="link small" disabled={busy} onClick={askAi} data-testid="suggest-refresh">
                Check again
              </button>
            </>
          ) : (
            <>
              <span className="muted small">AI compares the module's requirements with the existing screens and proposes the screens still missing.</span>
              <SampleBadge />
              <Btn size="sm" disabled={busy} onClick={askAi} data-testid="suggest-refresh">
                <Icon name="ai" size="sm" />
                Find missing screens
              </Btn>
            </>
          )}
        </div>
      )}
      <div className="suggest-list">
        {items.map((s) => (
          <SuggestionCard key={s.key} title={s.name} reason={reasonOf(s)} disabled={busy} onAccept={() => onCreate(s.name, s.prompt)} onDismiss={() => act(() => dismissSuggestion(m.id, s.key))} />
        ))}
        {!items.length && ai.checkedAt && <div className="muted small">All requirements are covered</div>}
        {showDismissed && (
          <>
            <div className="muted small">Dismissed</div>
            {dismissed.map((s) => (
              <SuggestionCard
                key={s.key}
                title={s.name}
                reason={reasonOf(s)}
                disabled={busy}
                dismissLabel="Restore"
                onAccept={() => onCreate(s.name, s.prompt)}
                onDismiss={() => act(() => restoreSuggestion(m.id, s.key))}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
