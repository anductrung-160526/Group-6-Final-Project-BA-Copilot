// Nhật ký AI (đợt 5): cấp dự án #/p/:pid/logs[/<moduleId>] – mọi lần gọi AI của các module, lọc theo module.
// Dữ liệu: GET /api/projects/:id/runs?moduleId= (docs/api.md 5.1). Chủ sở hữu: C3.
// Vẫn nhận `{ moduleId }` để tab "Nhật ký AI" cũ trong ModuleView/moduleTabs còn chạy tới khi C0 dọn.
import React, { useEffect, useState } from "react";
import { get, listProjectRuns } from "../api.ts";
import type { Module, PromptRun } from "../../shared/types.ts";
import { Badge, Empty, Select, fmtTime, useUI } from "../components/ui.tsx";
import { logsHref } from "../projectMenu.ts";

const TYPE_VI: Record<string, string> = {
  generate_screen: "Sinh màn hình",
  edit_screen_region: "Sửa theo vùng",
  edit_screen_global: "Sửa toàn màn hình",
  generate_use_cases: "Sinh UC + yêu cầu",
  generate_srs: "Sinh SRS",
  generate_sequences: "Sinh sequence",
  generate_tests: "Sinh test case",
  refine_use_case: "Chỉnh UC",
  refine_srs: "Chỉnh SRS",
  refine_sequence: "Chỉnh sequence",
};

export function LogsTab({ projectId, params = [], moduleId: fixedModule }: { projectId?: string; params?: string[]; moduleId?: string }) {
  const { toast } = useUI();
  const [runs, setRuns] = useState<PromptRun[] | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const filter = fixedModule ?? params[0] ?? "";

  useEffect(() => {
    if (!projectId) return;
    get<{ modules: Module[] }>(`/api/projects/${encodeURIComponent(projectId)}`)
      .then((p) => setModules(p.modules ?? []))
      .catch(() => setModules([]));
  }, [projectId]);
  useEffect(() => {
    setRuns(null);
    const req = projectId ? listProjectRuns(projectId, filter ? { moduleId: filter } : {}) : get<PromptRun[]>(`/api/modules/${encodeURIComponent(filter)}/runs`);
    req.then(setRuns).catch((e) => (toast(e.message, "err"), setRuns([])));
  }, [projectId, filter]);

  const moduleName = (id: string | null) => modules.find((m) => m.id === id)?.name ?? "";
  const pickModule = (id: string) => {
    if (projectId) window.location.hash = id ? `${logsHref(projectId)}/${encodeURIComponent(id)}` : logsHref(projectId);
  };

  const ok = runs?.filter((r) => r.ok) ?? [];
  const sum = (k: "inputTokens" | "outputTokens" | "latencyMs") => (runs ?? []).reduce((a, r) => a + r[k], 0);
  const showModule = !!projectId && !filter;
  const cols = showModule ? 7 : 6;

  const body =
    runs === null ? (
      <div className="muted pad">Đang tải…</div>
    ) : !runs.length ? (
      <Empty title="Chưa có lần gọi AI nào">{filter ? "Module này chưa gọi AI lần nào." : "Các lần sinh tài liệu, sơ đồ, màn hình, test case bằng AI sẽ hiện ở đây."}</Empty>
    ) : (
      <>
        <p className="muted small">
          {runs.length} lần gọi · thành công {ok.length} · token vào {sum("inputTokens").toLocaleString("vi-VN")} · token ra {sum("outputTokens").toLocaleString("vi-VN")} · độ trễ TB{" "}
          {Math.round(sum("latencyMs") / runs.length).toLocaleString("vi-VN")} ms
        </p>
        <div className="table-wrap">
          <table className="tbl" data-testid="logs-table">
            <thead>
              <tr>
                <th>Thời gian</th>
                {showModule && <th>Module</th>}
                <th>Tác vụ</th>
                <th>Mô hình</th>
                <th>Kết quả</th>
                <th className="right">Token vào/ra</th>
                <th className="right">Độ trễ</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <React.Fragment key={r.id}>
                  <tr className="clickable" onClick={() => setOpen(open === r.id ? null : r.id)} data-testid="log-row">
                    <td className="nowrap">{fmtTime(r.createdAt)}</td>
                    {showModule && <td>{moduleName(r.moduleId)}</td>}
                    <td>{TYPE_VI[r.type] ?? r.type}</td>
                    <td className="small">{r.provider === "mock" ? "rule-based" : r.model}</td>
                    <td>
                      {r.ok ? <Badge tone="green">OK</Badge> : <Badge tone="red">Lỗi</Badge>} {r.error && <span className="small muted">{r.error.slice(0, 80)}</span>}
                    </td>
                    <td className="right nowrap">
                      {r.inputTokens} / {r.outputTokens}
                    </td>
                    <td className="right nowrap">{r.latencyMs} ms</td>
                  </tr>
                  {open === r.id && (
                    <tr className="detail-row">
                      <td colSpan={cols}>
                        <div className="box-title">Prompt</div>
                        <pre className="code small">{r.input}</pre>
                        <div className="box-title">Kết quả</div>
                        <pre className="code small">{r.output}</pre>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );

  // Tab cũ trong trang module: chỉ bảng, không có đầu trang.
  if (!projectId) return <div className="docs">{body}</div>;

  return (
    <div className="page" data-testid="logs-view">
      <div className="page-head">
        <div>
          <h1>Nhật ký AI</h1>
          <p className="muted">Mọi lần gọi AI trong dự án (mới nhất trước) – bấm một dòng để xem prompt và kết quả.</p>
        </div>
        <div className="filters">
          <Select value={filter} placeholder="Mọi module" options={modules.map((m) => ({ value: m.id, label: m.name }))} onChange={pickModule} testId="logs-filter-module" />
        </div>
      </div>
      {body}
    </div>
  );
}
