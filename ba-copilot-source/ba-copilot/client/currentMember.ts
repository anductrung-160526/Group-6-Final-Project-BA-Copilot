// Người đang làm việc (FN-02, thay cho đăng nhập). Chủ sở hữu: A3. Các agent khác dùng `useCurrentMember()`.
//
//   const { me, members } = useCurrentMember();
//   post(`/api/...`, { ...body, actorId: me?.id });   // hoặc withActor(body)
//
// Lựa chọn lưu ở localStorage khoá `bacopilot.me` nên tải lại trang vẫn nhớ. Danh sách thành viên tải một lần,
// dùng chung cho mọi component; màn Thành viên gọi `reloadMembers()` sau khi thêm/sửa/xoá.

import { useEffect, useSyncExternalStore } from "react";
import type { Member, MemberRole } from "../shared/types.ts";
import { listMembers } from "./api.ts";

export const ME_KEY = "bacopilot.me";
export const ROLE_LABEL: Record<MemberRole, string> = { BA: "BA", BA_LEAD: "BA Lead" };

function readStored(): string | null {
  try {
    return window.localStorage.getItem(ME_KEY);
  } catch {
    return null;
  }
}
function writeStored(id: string | null) {
  try {
    if (id) window.localStorage.setItem(ME_KEY, id);
    else window.localStorage.removeItem(ME_KEY);
  } catch {
    // trình duyệt chặn lưu trữ: vẫn nhớ trong phiên hiện tại
  }
}

interface State {
  meId: string | null;
  members: Member[];
  loaded: boolean;
}
let state: State = { meId: readStored(), members: [], loaded: false };
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l));

let pending: Promise<void> | null = null;
/** Tải lại danh sách thành viên (gọi sau khi thêm, sửa, xoá thành viên). */
export function reloadMembers(): Promise<void> {
  pending = listMembers()
    .then((members) => set({ members, loaded: true }))
    .catch(() => set({ loaded: true }));
  return pending;
}

/** Chọn người đang làm việc; null = bỏ chọn. */
export function setCurrentMember(id: string | null) {
  writeStored(id);
  set({ meId: id });
}

/** Mã người đang làm việc cho code ngoài React; undefined khi chưa chọn hoặc người đó đã bị xoá. */
export function currentMemberId(): string | undefined {
  const { meId, members, loaded } = state;
  if (!meId) return undefined;
  return !loaded || members.some((m) => m.id === meId) ? meId : undefined;
}

/** Thêm `actorId` của người đang làm việc vào body gửi lên API (docs/api.md mục 0). */
export const withActor = <T extends object>(body: T): T & { actorId?: string } => ({ ...body, actorId: currentMemberId() });

export function useCurrentMember() {
  const s = useSyncExternalStore(subscribe, () => state);
  useEffect(() => {
    if (!state.loaded && !pending) reloadMembers();
  }, []);
  const me = s.members.find((m) => m.id === s.meId) ?? null;
  return { me, members: s.members, loaded: s.loaded, setMe: setCurrentMember, reload: reloadMembers };
}
