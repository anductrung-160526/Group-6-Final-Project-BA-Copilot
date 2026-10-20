// SCR-02 – Thanh trên (đợt 5): logo, menu ngoài (Dự án; "Quản trị hệ thống" chỉ khi người đang chọn là BA Lead),
// ô "Tôi là…" (FN-02 – thay cho đăng nhập), chế độ AI, đăng xuất (chỉ khi bật cổng APP_PASSWORD).
// Menu trong dự án (Công việc, Kho tài liệu…) nằm ở menu trái của ProjectShell. Chủ sở hữu: C3.
import React, { useEffect, useState } from "react";
import { get } from "../api.ts";
import { PAGES, pageHref } from "../routes.ts";
import { ROLE_LABEL, useCurrentMember } from "../currentMember.ts";
import { MemberPicker, Tabs } from "./ui.tsx";

function useHash() {
  const [hash, setHash] = useState(window.location.hash || "#/");
  useEffect(() => {
    const h = () => setHash(window.location.hash || "#/");
    window.addEventListener("hashchange", h);
    return () => window.removeEventListener("hashchange", h);
  }, []);
  return hash;
}

export function TopBar() {
  const hash = useHash();
  const parts = hash.replace(/^#\/?/, "").split("/");
  const { me, members, loaded, setMe } = useCurrentMember();
  const [settings, setSettings] = useState<{ provider: string; model: string; auth?: boolean } | null>(null);
  useEffect(() => {
    get("/api/settings").then(setSettings).catch(() => {});
  }, []);

  const isLead = me?.role === "BA_LEAD";
  const menu = [
    { key: "projects", label: "Dự án", href: "#/", testId: "nav-projects" },
    ...PAGES.filter((p) => !p.hidden && (!p.leadOnly || isLead)).map((p) => ({ key: p.key, label: p.label, href: pageHref(p), testId: `nav-${p.key}` })),
  ];
  // Trang chủ và mọi trang trong dự án / module đều thuộc mục "Dự án".
  const active = !parts[0] || parts[0] === "p" || parts[0] === "m" ? "projects" : parts[0];

  return (
    <header className="topbar" data-testid="topbar">
      <a href="#/" className="brand">
        <span className="logo">BA</span>
        <span>
          BA Copilot<span className="brand-sub">Yêu cầu → Tài liệu → Sơ đồ → Prototype → Test</span>
        </span>
      </a>
      <Tabs variant="pill" items={menu} active={active} />
      <span className="spacer" />
      <label className="member-picker" title="Người đang thao tác: tên được ghi lên bình luận, phiên bản và công việc; quyền BA Lead xét theo người này">
        <span className="muted small">Tôi là</span>
        {loaded && !members.length ? (
          <a className="link small" href="#/admin" data-testid="me-empty">
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
