import React, { useEffect, useState } from "react";
import { get } from "../api.ts";
import type { PromptRun } from "../../shared/types.ts";
import { Badge, Empty, fmtTime } from "../components/ui.tsx";

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

export function LogsTab({ moduleId }: { moduleId: string }) {
  const [runs, setRuns] = useState<PromptRun[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    get<PromptRun[]>(`/api/modules/${moduleId}/runs`).then(setRuns);
  }, [moduleId]);
  if (!runs) return <div className="muted pad">Đang tải…</div>;
  if (!runs.length) return <Empty title="Chưa có lần gọi AI nào" />;
  const ok = runs.filter((r) => r.ok);
  const sum = (k: "inputTokens" | "outputTokens" | "latencyMs") => runs.reduce((a, r) => a + r[k], 0);
  return (
    <div className="docs">
      <p className="muted small">
        Nhật ký phục vụ chương đánh giá thực nghiệm: {runs.length} lần gọi · thành công {ok.length} · token vào {sum("inputTokens").toLocaleString("vi-VN")} · token ra {sum("outputTokens").toLocaleString("vi-VN")} · độ trễ TB {Math.round(sum("latencyMs") / runs.length).toLocaleString("vi-VN")} ms
      </p>
      <table className="tbl">
        <thead>
          <tr>
            <th>Thời gian</th>
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
              <tr className="clickable" onClick={() => setOpen(open === r.id ? null : r.id)}>
                <td className="nowrap">{fmtTime(r.createdAt)}</td>
                <td>{TYPE_VI[r.type] ?? r.type}</td>
                <td className="small">{r.provider === "mock" ? "rule-based" : r.model}</td>
                <td>{r.ok ? <Badge tone="green">OK</Badge> : <Badge tone="red">Lỗi</Badge>} {r.error && <span className="small muted">{r.error.slice(0, 80)}</span>}</td>
                <td className="right nowrap">
                  {r.inputTokens} / {r.outputTokens}
                </td>
                <td className="right nowrap">{r.latencyMs} ms</td>
              </tr>
              {open === r.id && (
                <tr className="detail-row">
                  <td colSpan={6}>
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
  );
}
