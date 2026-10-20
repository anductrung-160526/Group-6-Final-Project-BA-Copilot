// SCR-16 – Khối "Gợi ý tiếp theo" ở cột trái tab Thiết kế (UC-29, FN-57 → FN-61). Chủ sở hữu: A9.
// Gợi ý do server tính (GET /api/modules/:id/suggestions); Bỏ qua / Khôi phục lưu theo module trên server.
// Không tự tạo màn (BR-06): nút Tạo chỉ gọi onCreate để DesignTab mở hộp thoại "Màn hình mới" đã điền sẵn.

import React, { useEffect, useMemo, useState } from "react";
import { dismissSuggestion, getScreenSuggestions, restoreSuggestion } from "../api.ts";
import type { ModuleDetail, ScreenSuggestion, ScreenSuggestions } from "../../shared/types.ts";
import { splitStories } from "../../shared/qus.ts";
import { SuggestionCard, useUI } from "./ui.tsx";

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
  const { toast } = useUI();
  const [data, setData] = useState<ScreenSuggestions | null>(null);
  const [showDismissed, setShowDismissed] = useState(false);
  const [busy, setBusy] = useState(false);

  // Tiền điều kiện UC-29: module có story, FR hoặc ít nhất một màn.
  const hasSource = useMemo(
    () => m.screens.length > 0 || m.docs.requirements.some((r) => r.type === "FR") || splitStories(m.requirementInput).length > 0,
    [m.screens, m.docs.requirements, m.requirementInput],
  );

  const load = () =>
    getScreenSuggestions(m.id)
      .then(setData)
      .catch((e) => toast(e.message, "err"));

  // `m` đổi sau mỗi lần DesignTab gọi reload() (tạo màn, duyệt, sửa màn, sửa yêu cầu…) → tính lại gợi ý (UC-29 bước 7).
  useEffect(() => {
    if (hasSource) load();
  }, [m, hasSource]);

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

  if (!hasSource || !data) return null;
  const { items, dismissed } = data;

  return (
    <div className="suggest-block" data-testid="suggest-block">
      <div className="side-head">
        <span>Gợi ý tiếp theo ({items.length})</span>
        {dismissed.length > 0 && (
          <button className="link small" onClick={() => setShowDismissed((v) => !v)} title="Xem các gợi ý đã bỏ qua để khôi phục" data-testid="suggest-show-dismissed">
            {showDismissed ? "Thu gọn" : `Đã ẩn ${dismissed.length}`}
          </button>
        )}
      </div>
      <div className="suggest-list">
        {items.map((s) => (
          <SuggestionCard key={s.key} title={s.name} reason={reasonOf(s)} disabled={busy} onAccept={() => onCreate(s.name, s.prompt)} onDismiss={() => act(() => dismissSuggestion(m.id, s.key))} />
        ))}
        {!items.length && <div className="muted small">Đã phủ đủ yêu cầu</div>}
        {showDismissed && (
          <>
            <div className="muted small">Đã bỏ qua</div>
            {dismissed.map((s) => (
              <SuggestionCard
                key={s.key}
                title={s.name}
                reason={reasonOf(s)}
                disabled={busy}
                dismissLabel="Khôi phục"
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
