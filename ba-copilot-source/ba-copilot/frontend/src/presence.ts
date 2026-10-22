// "Đang được sửa bởi …" phía client (kế hoạch đợt 5, quyết định 9b). Chủ sở hữu: C2.
//
//   const others = usePresence("doc", moduleId, "BRD");     // [] khi không ai khác đang mở
//   {others.length > 0 && <EditingBadge names={others.map((o) => o.name)} />}   // EditingBadge của C1
//
// Gửi nhịp ngay khi mở và mỗi 30 giây (server coi là rời sau 90 giây không nhịp), báo rời khi đóng.
// Chế độ demo (chưa đăng nhập thành viên) server nhận người gửi qua actorId của ô "Tôi là…".
// id rỗng/undefined → không gửi gì (vd chưa chọn module).
// Đổi người ở ô "Acting as" → báo rời bằng mã người cũ rồi đăng ký lại bằng người mới (không để tên cũ treo 90 giây).

import { useEffect, useState } from "react";
import type { PresenceEntry, PresenceKind, PresenceTarget } from "../../shared/types.ts";
import { leavePresence, touchPresence } from "./api.ts";
import { currentMemberId, useCurrentMember } from "./currentMember.ts";

export const PRESENCE_BEAT_MS = 30_000;

export function usePresence(kind: PresenceKind, id: string | null | undefined, sub?: string): PresenceEntry[] {
  const [others, setOthers] = useState<PresenceEntry[]>([]);
  const meId = useCurrentMember().me?.id;

  useEffect(() => {
    if (!id) {
      setOthers([]);
      return;
    }
    const target: PresenceTarget = { kind, id, ...(sub ? { sub } : {}) };
    const actorId = currentMemberId(); // giữ mã người lúc đăng ký: lúc dọn dẹp ô "Acting as" có thể đã đổi người
    let alive = true;
    const beat = () =>
      touchPresence(target, actorId)
        .then((list) => alive && setOthers(list))
        .catch(() => {
          /* mất mạng / chưa đăng nhập: giữ danh sách cũ, nhịp sau thử lại */
        });
    beat();
    const timer = window.setInterval(beat, PRESENCE_BEAT_MS);
    // Quay lại tab sau khi ẩn lâu → gửi nhịp ngay để danh sách không cũ
    const onVisible = () => document.visibilityState === "visible" && beat();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      leavePresence(target, actorId).catch(() => {});
    };
  }, [kind, id, sub, meId]);

  return others;
}
