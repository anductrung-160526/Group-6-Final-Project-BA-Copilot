// "Đang được sửa bởi …" (kế hoạch đợt 5, quyết định 9b). Chủ sở hữu: C2.
// Lưu trong bộ nhớ tiến trình (mất khi khởi động lại – chấp nhận được vì chỉ là gợi ý, không phải khoá).
// Client gửi nhịp mỗi PRESENCE_BEAT_MS; quá PRESENCE_TTL_MS không có nhịp thì coi như đã rời.
// Route: POST/GET/DELETE /api/presence (server/app.ts). Hook client: usePresence() trong client/presence.ts.

import type { PresenceEntry, PresenceKind, PresenceTarget } from "../shared/types.ts";

export const PRESENCE_BEAT_MS = 30_000;
export const PRESENCE_TTL_MS = 90_000;
export const PRESENCE_KINDS: PresenceKind[] = ["screen", "doc", "diagram", "tests", "story"];

interface Entry {
  memberId: string;
  name: string;
  since: number;
  lastSeen: number;
}

const store = new Map<string, Map<string, Entry>>();

const keyOf = (t: PresenceTarget) => `${t.kind}:${t.id}:${t.sub ?? ""}`;
const toEntry = (e: Entry): PresenceEntry => ({ memberId: e.memberId, name: e.name, since: new Date(e.since).toISOString(), lastSeen: new Date(e.lastSeen).toISOString() });

function prune(key: string, now: number): Map<string, Entry> | undefined {
  const m = store.get(key);
  if (!m) return undefined;
  for (const [id, e] of m) if (now - e.lastSeen > PRESENCE_TTL_MS) m.delete(id);
  if (!m.size) store.delete(key);
  return m.size ? m : undefined;
}

/** Ghi nhịp "đang mở" của một thành viên. */
export function touchPresence(t: PresenceTarget, member: { id: string; name: string }, now = Date.now()): void {
  const key = keyOf(t);
  prune(key, now);
  const m = store.get(key) ?? new Map<string, Entry>();
  const old = m.get(member.id);
  m.set(member.id, { memberId: member.id, name: member.name, since: old?.since ?? now, lastSeen: now });
  store.set(key, m);
}

/** Những người đang mở (còn hạn), trừ `excludeMemberId`; người mở trước đứng trước. */
export function listPresence(t: PresenceTarget, excludeMemberId?: string | null, now = Date.now()): PresenceEntry[] {
  const m = prune(keyOf(t), now);
  if (!m) return [];
  return [...m.values()]
    .filter((e) => e.memberId !== excludeMemberId)
    .sort((a, b) => a.since - b.since)
    .map(toEntry);
}

/** Rời màn (client gọi khi đóng). */
export function leavePresence(t: PresenceTarget, memberId: string): void {
  const m = store.get(keyOf(t));
  m?.delete(memberId);
  if (m && !m.size) store.delete(keyOf(t));
}

/** Chỉ dùng trong test. */
export function clearPresence(): void {
  store.clear();
}
