// SCR-02 – Thanh trên (đợt 5): logo, menu ngoài (Dự án; "Quản trị hệ thống" chỉ khi người đang chọn là BA Lead),
// ô "Tôi là…" (FN-02 – thay cho đăng nhập), chế độ AI, đăng xuất (chỉ khi bật cổng APP_PASSWORD).
// Menu trong dự án (Công việc, Kho tài liệu…) nằm ở menu trái của ProjectShell. Chủ sở hữu: C3.
// Thanh luôn dính đỉnh; cuộn quá COMPACT_AT thì thu gọn (styles.css `.topbar.is-compact` bù đúng phần chiều cao giảm
// bằng margin để nội dung không nhảy). Chiều cao thật ghi vào `--topbar-live-h` cho các phần dính bên dưới (menu trái, hàng tab).
import React, { useEffect, useRef, useState } from "react";
import { get } from "../api.ts";
import { PAGES, pageHref } from "../routes.ts";
import { ROLE_LABEL, useCurrentMember } from "../currentMember.ts";
import { Icon, MemberPicker, Tabs } from "./ui.tsx";

function useHash() {
  const [hash, setHash] = useState(window.location.hash || "#/");
  useEffect(() => {
    const h = () => setHash(window.location.hash || "#/");
    window.addEventListener("hashchange", h);
    return () => window.removeEventListener("hashchange", h);
  }, []);
  return hash;
}

// Ngưỡng có độ trễ: thu gọn khi cuộn quá 40px, chỉ mở lại khi về dưới 16px (không chớp khi cuộn quanh ngưỡng).
const COMPACT_AT = 40;
const EXPAND_AT = 16;
function useCompactHeader(ref: React.RefObject<HTMLElement | null>): boolean {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    let frame = 0;
    const check = () => {
      frame = 0;
      const y = window.scrollY;
      setCompact((c) => (c ? y > EXPAND_AT : y > COMPACT_AT));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    check();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement;
    const ro = new ResizeObserver(() => root.style.setProperty("--topbar-live-h", `${el.offsetHeight}px`));
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--topbar-live-h");
    };
  }, []);
  return compact;
}

export function TopBar() {
  const hash = useHash();
  const ref = useRef<HTMLElement>(null);
  const compact = useCompactHeader(ref);
  const parts = hash.replace(/^#\/?/, "").split("/");
  const { me, members, loaded, setMe } = useCurrentMember();
  const [settings, setSettings] = useState<{ provider: string; model: string; auth?: boolean } | null>(null);
  useEffect(() => {
    get("/api/settings").then(setSettings).catch(() => {});
  }, []);

  const isLead = me?.role === "BA_LEAD";
  const menu = [
    { key: "projects", label: "Projects", href: "#/", testId: "nav-projects" },
    ...PAGES.filter((p) => !p.hidden && (!p.leadOnly || isLead)).map((p) => ({ key: p.key, label: p.label, href: pageHref(p), testId: `nav-${p.key}` })),
  ];
  // Trang chủ và mọi trang trong dự án / module đều thuộc mục "Dự án".
  const active = !parts[0] || parts[0] === "p" || parts[0] === "m" ? "projects" : parts[0];

  return (
    <header ref={ref} className={`topbar ${compact ? "is-compact" : ""}`} data-compact={compact ? "1" : undefined} data-testid="topbar">
      <a href="#/" className="brand">
        <span className="logo">BA</span>
        <span>
          BA Copilot<span className="brand-sub">Requirements → Documents → Diagrams → Prototype → Test</span>
        </span>
      </a>
      <Tabs variant="pill" items={menu} active={active} />
      <span className="spacer" />
      <label className="member-picker" title="Current user: this name is recorded on comments, versions and tasks; BA Lead permissions are checked for this person">
        <span className="muted small">Acting as</span>
        {loaded && !members.length ? (
          <a className="link small" href="#/admin" data-testid="me-empty">
            Add members first
          </a>
        ) : (
          <MemberPicker
            members={members.map((m) => ({ id: m.id, name: m.name, role: ROLE_LABEL[m.role] }))}
            value={me?.id ?? null}
            onChange={setMe}
            placeholder="Select your name…"
            testId="me-picker"
          />
        )}
      </label>
      {settings && (
        <span className={`ai-pill ${settings.provider === "claude" ? "on" : ""}`} title={settings.provider === "claude" ? "Using the Claude API" : "No Claude key (ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN) – running the rule-based generator"}>
          {settings.provider === "claude" ? `Claude · ${settings.model}` : "Mock mode (rule-based)"}
        </span>
      )}
      {settings?.auth && (
        <button className="btn btn-ghost btn-sm" onClick={() => fetch("/api/logout", { method: "POST" }).then(() => window.location.reload())}>
          <Icon name="logout" size="sm" />
          Sign out
        </button>
      )}
    </header>
  );
}
