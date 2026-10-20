// SCR-02 – Thanh trên: logo, menu trang (dựng từ client/routes.ts), ô "Tôi là…" (FN-02), chế độ AI, đăng xuất.
// Chủ sở hữu: A3. main.tsx thay khối <header className="topbar"> bằng <TopBar />.
import React, { useEffect, useState } from "react";
import { get } from "../api.ts";
import { PAGES, pageHref } from "../routes.ts";
import { ROLE_LABEL, useCurrentMember } from "../currentMember.ts";
import { MemberPicker } from "./ui.tsx";

function useHash() {
  const [hash, setHash] = useState(window.location.hash || "#/");
  useEffect(() => {
    const h = () => setHash(window.location.hash || "#/");
    window.addEventListener("hashchange", h);
    return () => window.removeEventListener("hashchange", h);
  }, []);
  return hash;
}

// Dự án đang mở – để menu Công việc / Kho tài liệu trỏ đúng dự án, kể cả khi đang ở trang global (Thành viên).
let lastProjectId = "";
const moduleProject = new Map<string, string>();

function useProjectId(parts: string[]): string {
  const [pid, setPid] = useState(lastProjectId);
  const moduleId = parts[0] === "m" ? parts[1] ?? "" : "";
  useEffect(() => {
    if (parts[0] === "p" && parts[1]) return setPid((lastProjectId = parts[1]));
    if (!moduleId) return setPid(lastProjectId);
    const known = moduleProject.get(moduleId);
    if (known) return setPid((lastProjectId = known));
    let alive = true;
    get<{ projectId: string }>(`/api/modules/${encodeURIComponent(moduleId)}`)
      .then((m) => {
        moduleProject.set(moduleId, m.projectId);
        if (alive) setPid((lastProjectId = m.projectId));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [parts[0], parts[1]]);
  return pid;
}

export function TopBar() {
  const hash = useHash();
  const parts = hash.replace(/^#\/?/, "").split("/");
  const projectId = useProjectId(parts);
  const { me, members, loaded, setMe } = useCurrentMember();
  const [settings, setSettings] = useState<{ provider: string; model: string; auth?: boolean } | null>(null);
  useEffect(() => {
    get("/api/settings").then(setSettings).catch(() => {});
  }, []);

  const menu = PAGES.filter((p) => !p.hidden && (p.scope === "global" || projectId));
  const active = (parts[0] === "p" ? parts[2] : parts[0]) ?? "";

  return (
    <header className="topbar" data-testid="topbar">
      <a href="#/" className="brand">
        <span className="logo">BA</span>
        <span>
          BA Copilot<span className="brand-sub">Prompt → Thiết kế → Tài liệu → Test</span>
        </span>
      </a>
      {/* Menu dạng pill: mục đang chọn nền mint nhạt, chữ mint-700 đậm (dùng .chip / .chip-sel có sẵn) */}
      <nav className="tpl-row" aria-label="Menu chính">
        {menu.map((p) =>
          p.key === active ? (
            <a key={p.key} href={pageHref(p, projectId)} className="chip chip-sel" aria-current="page" data-testid={`nav-${p.key}`}>
              <strong>{p.label}</strong>
            </a>
          ) : (
            <a key={p.key} href={pageHref(p, projectId)} className="chip muted" data-testid={`nav-${p.key}`}>
              {p.label}
            </a>
          ),
        )}
      </nav>
      <span className="spacer" />
      <label className="member-picker" title="Tên của bạn được ghi lên bình luận, phiên bản thiết kế và công việc">
        <span className="muted small">Tôi là</span>
        {loaded && !members.length ? (
          <a className="link small" href="#/members" data-testid="me-empty">
            Thêm thành viên trước
          </a>
        ) : (
          <MemberPicker
            members={members.map((m) => ({ id: m.id, name: m.name, role: ROLE_LABEL[m.role] }))}
            value={me?.id ?? null}
            onChange={setMe}
            placeholder="Chọn tên của bạn…"
            testId="me-picker"
          />
        )}
      </label>
      {settings && (
        <span className={`ai-pill ${settings.provider === "claude" ? "on" : ""}`} title={settings.provider === "claude" ? "Đang dùng Claude API" : "Chưa có ANTHROPIC_API_KEY – đang chạy bộ sinh rule-based"}>
          {settings.provider === "claude" ? `Claude · ${settings.model}` : "Chế độ Mock (rule-based)"}
        </span>
      )}
      {settings?.auth && (
        <button className="btn btn-ghost btn-sm" onClick={() => fetch("/api/logout", { method: "POST" }).then(() => window.location.reload())}>
          Đăng xuất
        </button>
      )}
    </header>
  );
}
