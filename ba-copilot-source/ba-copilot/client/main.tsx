// Điểm vào client (đợt 5). Chủ sở hữu: C3.
//   #/                         trang chủ – danh sách dự án
//   #/<key>                    trang global (client/routes.ts): #/admin, #/_gallery
//   #/p/:pid/<section>/...     trong dự án – ProjectShell + menu trái (client/projectMenu.ts)
// URL cũ được chuyển hướng (thay mục lịch sử, không thêm): #/p/:id → Quản lý công việc, #/p/:id/modules → Thực hiện
// công việc, #/m/:id/<tab> → URL mới theo legacyModuleHref, #/members → #/admin.
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { UIProvider } from "./components/ui.tsx";
import { TopBar } from "./components/TopBar.tsx";
import { ProjectShell } from "./components/ProjectShell.tsx";
import { Home } from "./views/Home.tsx";
import { get } from "./api.ts";
import { LEGACY_GLOBAL, matchPage } from "./routes.ts";
import { legacyModuleHref, matchProjectRoute, projectHref } from "./projectMenu.ts";

export function navigate(hash: string) {
  window.location.hash = hash;
}

function useHash() {
  const [hash, setHash] = useState(window.location.hash || "#/");
  useEffect(() => {
    const h = () => setHash(window.location.hash || "#/");
    window.addEventListener("hashchange", h);
    return () => window.removeEventListener("hashchange", h);
  }, []);
  return hash;
}

/** URL cũ / chưa đủ → URL mới; null = không cần chuyển. Module cũ cần hỏi server projectId nên trả "module". */
function redirectOf(parts: string[]): string | "module" | null {
  if (parts[0] === "m" && parts[1]) return "module";
  if (LEGACY_GLOBAL[parts[0]]) return LEGACY_GLOBAL[parts[0]];
  if (parts[0] === "p" && parts[1]) {
    const pid = decodeURIComponent(parts[1]);
    if (!parts[2]) return projectHref(pid);
    if (parts[2] === "modules") return `#/p/${encodeURIComponent(pid)}/work${parts[3] ? `/${parts[3]}` : ""}`;
    if (!matchProjectRoute(parts)) return projectHref(pid);
  }
  return null;
}

function App() {
  const hash = useHash();
  const parts = hash.replace(/^#\/?/, "").split("/");
  const redirect = redirectOf(parts);

  useEffect(() => {
    if (!redirect) return;
    if (redirect !== "module") return window.location.replace(redirect);
    let alive = true;
    const moduleId = decodeURIComponent(parts[1]);
    get<{ projectId: string }>(`/api/modules/${encodeURIComponent(moduleId)}`)
      .then((m) => alive && window.location.replace(legacyModuleHref(m.projectId, moduleId, parts[2] || "design")))
      .catch(() => alive && window.location.replace("#/"));
    return () => {
      alive = false;
    };
  }, [hash]);

  let view: React.ReactNode;
  const page = matchPage(parts);
  const project = matchProjectRoute(parts);
  if (redirect) view = <div className="page muted">Đang chuyển trang…</div>;
  else if (page) view = <page.page.component {...page.props} />;
  else if (project) view = <ProjectShell key={project.projectId} route={project} />;
  else view = <Home />;

  return (
    <div className="app">
      <TopBar />
      <main className="main">{view}</main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <UIProvider>
    <App />
  </UIProvider>,
);
