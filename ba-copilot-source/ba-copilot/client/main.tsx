import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { UIProvider } from "./components/ui.tsx";
import { TopBar } from "./components/TopBar.tsx";
import { Home } from "./views/Home.tsx";
import { ProjectView } from "./views/ProjectView.tsx";
import { ModuleView } from "./views/ModuleView.tsx";
import { matchPage } from "./routes.ts";

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

function App() {
  const hash = useHash();
  const parts = hash.replace(/^#\/?/, "").split("/");
  const page = matchPage(parts); // trang đăng ký trong client/routes.ts
  let view: React.ReactNode;
  if (page) view = <page.page.component {...page.props} />;
  else if (parts[0] === "p" && parts[1]) view = <ProjectView id={parts[1]} tab={parts[2] || "modules"} initialModuleId={parts[3] || null} />;
  else if (parts[0] === "m" && parts[1]) view = <ModuleView id={parts[1]} tab={parts[2] || "design"} />;
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
