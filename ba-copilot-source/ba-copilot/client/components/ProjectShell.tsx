// Khung trong dự án (đợt 5, kế hoạch mục 3 "C3"): đầu trang (tên dự án + nút GitHub) + menu trái (SideNav) dựng từ
// registry client/projectMenu.ts + vùng nội dung. "Thực hiện công việc" có bộ chọn module ở đầu vùng nội dung, nhớ
// module chọn gần nhất theo dự án; tạo / xoá module ở đây. Màn hẹp: menu trái thu thành nút "Menu" mở ngăn phải.
// Chủ sở hữu: C3. Nội dung từng màn do agent chủ màn làm (cột owner trong projectMenu.ts).
import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { Module, Project } from "../../shared/types.ts";
import { del, get, post } from "../api.ts";
import { useCurrentMember } from "../currentMember.ts";
import { PROJECT_MENU, WORK_STEPS, gitHref, projectHref, workHref, type ProjectRoute, type WorkStepItem } from "../projectMenu.ts";
import { Btn, Drawer, Empty, Field, ICON_NAMES, Icon, Modal, RowActions, Select, SideNav, useUI, type IconName, type SideNavItem } from "./ui.tsx";

type ProjectData = Project & { modules: Module[] };

// ---------------------------------------------------------------- icon
// projectMenu.ts ghi tên icon Lucide (vd "SquareKanban"); ui.tsx chỉ có bảng tên dùng chung. Có tên trùng (nguyên
// dạng hoặc viết thường chữ đầu) thì dùng luôn, không thì dùng icon gần nghĩa có sẵn (R-040 xin C1/C0 thêm icon).
const ICON_FALLBACK: Record<string, IconName> = {
  SquareKanban: "grid",
  BookText: "user",
  Workflow: "play",
  FolderOpen: "folder",
  ScrollText: "ai",
  GitBranch: "github",
};
function menuIcon(name: string): IconName | undefined {
  const camel = name.charAt(0).toLowerCase() + name.slice(1);
  if ((ICON_NAMES as string[]).includes(name)) return name as IconName;
  if ((ICON_NAMES as string[]).includes(camel)) return camel as IconName;
  return ICON_FALLBACK[name];
}

// ---------------------------------------------------------------- module nhớ theo dự án
const moduleKey = (pid: string) => `bacopilot.module.${pid}`;
function readModule(pid: string): string | null {
  try {
    return window.localStorage.getItem(moduleKey(pid));
  } catch {
    return null;
  }
}
function writeModule(pid: string, mid: string) {
  try {
    window.localStorage.setItem(moduleKey(pid), mid);
  } catch {
    // trình duyệt chặn lưu trữ: chỉ không nhớ được module, vẫn dùng bình thường
  }
}

// ---------------------------------------------------------------- màn hẹp
// Điểm gãy trùng .doc-layout (styles.css về 1 cột ở ≤ 860px) – gồm cả yêu cầu ≤ 768px của kế hoạch.
const NARROW = "(max-width: 860px)";
function useNarrow(): boolean {
  const mq = typeof window !== "undefined" && window.matchMedia ? window.matchMedia(NARROW) : null;
  const [narrow, setNarrow] = useState(!!mq?.matches);
  useEffect(() => {
    if (!mq) return;
    const h = () => setNarrow(mq.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);
  return narrow;
}

const subOf = (step: WorkStepItem | undefined, params: string[]) => (step?.subs?.some((s) => s.key === params[0]) ? params[0] : undefined);

export function ProjectShell({ route }: { route: ProjectRoute }) {
  const { projectId: pid, section, item, step, params } = route;
  const urlModule = route.moduleId ?? "";
  const { run, toast } = useUI();
  const { me } = useCurrentMember();
  const isLead = me?.role === "BA_LEAD";
  const narrow = useNarrow();
  const [project, setProject] = useState<ProjectData | null>(null);
  const [missing, setMissing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [creating, setCreating] = useState<string | null>(null); // tên module đang nhập, null = đóng hộp thoại

  const load = useCallback(
    () =>
      get<ProjectData>(`/api/projects/${encodeURIComponent(pid)}`)
        .then((p) => (setProject(p), setMissing(false), p))
        .catch((e) => {
          if (e?.status === 404 || /Không tìm thấy/.test(e?.message ?? "")) setMissing(true);
          else toast(e.message, "err");
          return null;
        }),
    [pid],
  );
  useEffect(() => {
    setProject(null);
    load();
  }, [load]);

  // Đóng menu (màn hẹp) khi chuyển trang.
  useEffect(() => {
    const h = () => setMenuOpen(false);
    window.addEventListener("hashchange", h);
    return () => window.removeEventListener("hashchange", h);
  }, []);

  const modules = project?.modules ?? [];
  const validUrlModule = modules.some((m) => m.id === urlModule) ? urlModule : "";
  // Module dùng cho liên kết menu: module trên URL, module nhớ gần nhất, hoặc module đầu tiên.
  const remembered = readModule(pid);
  const navModule = validUrlModule || (remembered && modules.some((m) => m.id === remembered) ? remembered : "") || modules[0]?.id || "";

  // Thực hiện công việc: URL chưa có module / module đã bị xoá → chuyển sang module mặc định; có module hợp lệ → nhớ lại.
  useEffect(() => {
    if (section !== "work" || !project) return;
    if (validUrlModule) return writeModule(pid, validUrlModule);
    if (navModule) window.location.replace(workHref(pid, navModule, step?.key, subOf(step, params)));
  }, [section, project, validUrlModule, navModule, step?.key, params.join("/")]);

  const workBase = `#/p/${encodeURIComponent(pid)}/work`;
  const items: SideNavItem[] = useMemo(
    () =>
      PROJECT_MENU.filter((m) => !m.leadOnly || isLead).map((m): SideNavItem => {
        if (m.key !== "work") return { key: m.key, label: m.label, icon: menuIcon(m.icon), href: projectHref(pid, m.key), testId: `pnav-${m.key}` };
        const href = (s?: WorkStepItem, sub?: string) => (navModule ? workHref(pid, navModule, s?.key, sub) : workBase);
        return {
          key: "work",
          label: m.label,
          icon: menuIcon(m.icon),
          href: href(),
          testId: "pnav-work",
          children: (m.steps ?? WORK_STEPS).map((s) => ({
            key: `work/${s.key}`,
            label: s.label,
            step: s.no,
            href: href(s),
            testId: `pnav-work-${s.key}`,
            children: s.subs?.map((sub) => ({ key: `work/${s.key}/${sub.key}`, label: sub.label, href: href(s, sub.key), testId: `pnav-work-${s.key}-${sub.key}` })),
          })),
        };
      }),
    [pid, navModule, isLead],
  );
  const sub = subOf(step, params);
  const active = section === "work" ? (step ? `work/${step.key}${sub ? `/${sub}` : ""}` : "work") : section;

  const createModule = async () => {
    const name = (creating ?? "").trim();
    if (!name) return;
    const m = await run("Đang tạo module", () => post<Module>(`/api/projects/${encodeURIComponent(pid)}/modules`, { name }));
    if (!m) return;
    setCreating(null);
    toast(`Đã tạo module ${m.name}`, "ok");
    writeModule(pid, m.id);
    await load();
    window.location.hash = workHref(pid, m.id, step?.key ?? "docs");
  };
  const deleteModule = async (m: Module) => {
    const r = await run("Đang xoá module", () => del(`/api/modules/${encodeURIComponent(m.id)}`));
    if (!r) return;
    toast(`Đã xoá module ${m.name}`, "ok");
    await load();
    window.location.replace(workBase + (step ? `//${step.key}` : ""));
  };

  if (missing)
    return (
      <div className="page">
        <Empty title="Không tìm thấy dự án">
          Dự án có thể đã bị xoá.{" "}
          <a className="link" href="#/">
            Về danh sách dự án
          </a>
        </Empty>
      </div>
    );
  if (!project) return <div className="page muted">Đang tải…</div>;

  const nav = <SideNav items={items} active={active} ariaLabel="Menu dự án" testId="project-nav" />;

  // ---- nội dung
  let content: React.ReactNode;
  if (section !== "work") {
    const C = item.component;
    content = C ? <C key={section} projectId={pid} params={params} /> : null;
  } else if (!modules.length) {
    content = (
      <div className="page">
        <Empty title="Chưa có module">
          Module là một nhóm chức năng (VD: Xác thực, Quản lý sản phẩm). Mỗi module đi qua 5 bước: Tài liệu → Sơ đồ → Prototype → Test case → Truy vết.
        </Empty>
        <Btn kind="primary" onClick={() => setCreating("")} data-testid="new-module">
          <Icon name="plus" size="sm" />
          Module
        </Btn>
      </div>
    );
  } else if (!validUrlModule || !step) {
    content = <div className="page muted">Đang mở module…</div>;
  } else {
    const current = modules.find((m) => m.id === validUrlModule)!;
    const Step = step.component;
    content = (
      <>
        <div className="toolbar filters" data-testid="module-bar">
          <span className="muted small">Module</span>
          <Select
            value={validUrlModule}
            options={modules.map((m) => ({ value: m.id, label: m.name }))}
            onChange={(id) => id && (window.location.hash = workHref(pid, id, step.key, sub))}
            testId="module-picker"
          />
          <RowActions
            testId="module"
            deleteLabel="Xoá module"
            onDelete={() => deleteModule(current)}
            deleteConfirm={{ title: `Xoá module "${current.name}"?`, message: "Tài liệu, sơ đồ, màn hình và test case của module sẽ bị xoá. User story của module được giữ lại, không còn gắn module.", okLabel: "Xoá" }}
          />
          <span className="spacer" />
          <Btn size="sm" onClick={() => setCreating("")} data-testid="new-module">
            <Icon name="plus" size="sm" />
            Module
          </Btn>
        </div>
        <Step key={`${validUrlModule}/${step.key}`} projectId={pid} moduleId={validUrlModule} params={params} />
      </>
    );
  }

  return (
    <div className="project-shell" data-testid="project-shell">
      <div className="module-head" style={{ paddingBottom: "var(--space-3)" }}>
        <div className="crumbs">
          <a href="#/">Dự án</a> / <span>{project.name}</span>
        </div>
        <div className="module-title-row">
          <h1>{project.name}</h1>
          {project.description && !narrow && <span className="muted small clamp">{project.description}</span>}
          <span className="spacer" />
          {narrow && (
            <Btn size="sm" onClick={() => setMenuOpen(true)} aria-expanded={menuOpen} data-testid="project-menu-btn">
              <Icon name="more" size="sm" />
              Menu
            </Btn>
          )}
          <a className="btn btn-secondary btn-sm" href={gitHref(pid)} data-testid="project-github">
            <Icon name="github" size="sm" />
            GitHub
          </a>
        </div>
      </div>

      {narrow ? (
        <div className="doc-main">{content}</div>
      ) : (
        <div className="doc-layout" style={{ paddingTop: "var(--space-4)", alignItems: "start" }}>
          <aside className="doc-nav">{nav}</aside>
          <div className="doc-main">{content}</div>
        </div>
      )}

      {narrow && menuOpen && (
        <Drawer title="Menu dự án" onClose={() => setMenuOpen(false)} testId="project-menu-drawer">
          {nav}
        </Drawer>
      )}

      {creating !== null && (
        <Modal
          title="Module mới"
          onClose={() => setCreating(null)}
          footer={
            <>
              <Btn onClick={() => setCreating(null)}>Huỷ</Btn>
              <Btn kind="primary" disabled={!creating.trim()} onClick={createModule} data-testid="create-module">
                Tạo module
              </Btn>
            </>
          }
        >
          <Field label="Tên module" hint="User story của module nhập ở mục Yêu cầu nghiệp vụ.">
            <input
              autoFocus
              value={creating}
              maxLength={200}
              onChange={(e) => setCreating(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createModule()}
              placeholder="VD: Xác thực người dùng"
              data-testid="module-name"
            />
          </Field>
        </Modal>
      )}
    </div>
  );
}
