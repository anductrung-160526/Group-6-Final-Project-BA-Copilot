import React, { useEffect, useState } from "react";
import { get } from "../api.ts";
import type { ModuleDetail } from "../../shared/types.ts";
import { Badge, Empty, useUI } from "../components/ui.tsx";

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

function Meter({ label, a, b, testid }: { label: string; a: number; b: number; testid: string }) {
  const v = pct(a, b);
  const tone = v >= 90 ? "good" : v >= 60 ? "warn" : "bad";
  return (
    <div className="meter" data-testid={testid}>
      <div className="meter-label">{label}</div>
      <div className="meter-value">
        {v}% <span className="muted small">({a}/{b})</span>
      </div>
      <div className="meter-bar">
        <div className={`meter-fill ${tone}`} style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

export function TraceTab({ m }: { m: ModuleDetail }) {
  const { toast } = useUI();
  const [t, setT] = useState<any>(null);
  useEffect(() => {
    get(`/api/modules/${m.id}/trace`).then(setT).catch((e) => toast(e.message, "err"));
  }, [m]);
  if (!t) return <div className="muted pad">Đang tải…</div>;
  if (!m.docs.requirements.length) return <Empty title="Chưa có dữ liệu truy vết">Sinh tài liệu và test case để xem ma trận Màn hình ↔ Use Case ↔ Yêu cầu ↔ Test case.</Empty>;
  const c = t.coverage;
  const screenName = (id: string) => t.screens.find((s: any) => s.id === id)?.name ?? id;
  return (
    <div className="docs">
      <div className="meters">
        <Meter label="Yêu cầu chức năng có test" a={c.frWithTests} b={c.frTotal} testid="cov-fr" />
        <Meter label="Luồng UC có test" a={c.flowsWithTests} b={c.flowsTotal} testid="cov-flow" />
        <Meter label="Use Case gắn màn hình" a={c.ucWithScreens} b={c.ucTotal} testid="cov-uc" />
      </div>
      {(c.untestedRequirements.length > 0 || c.untestedFlows.length > 0 || c.useCasesWithoutScreens.length > 0 || c.testsWithoutReference.length > 0) && (
        <div className="warn-banner">
          {c.untestedRequirements.length > 0 && <div>Yêu cầu chưa có test: {c.untestedRequirements.join(", ")}</div>}
          {c.untestedFlows.length > 0 && <div>Luồng chưa có test: {c.untestedFlows.join(", ")}</div>}
          {c.useCasesWithoutScreens.length > 0 && <div>Use Case chưa gắn màn hình: {c.useCasesWithoutScreens.join(", ")}</div>}
          {c.testsWithoutReference.length > 0 && <div>Test không tham chiếu được: {c.testsWithoutReference.join(", ")}</div>}
        </div>
      )}
      <table className="tbl">
        <thead>
          <tr>
            <th>Yêu cầu</th>
            <th>Nội dung</th>
            <th>Use Case</th>
            <th>Màn hình</th>
            <th>Test case</th>
          </tr>
        </thead>
        <tbody>
          {t.rows.map((r: any) => (
            <tr key={r.requirement.code} className={r.requirement.type === "FR" && !r.tests.length ? "row-warn" : ""}>
              <td className="nowrap strong">
                {r.requirement.code} <Badge tone={r.requirement.type === "FR" ? "blue" : "violet"}>{r.requirement.type}</Badge>
              </td>
              <td>{r.requirement.statement}</td>
              <td className="nowrap">{r.useCases.join(", ") || "—"}</td>
              <td>{r.screenIds.map(screenName).join(", ") || "—"}</td>
              <td>{r.tests.length ? <span className="small">{r.tests.join(", ")}</span> : <Badge tone={r.requirement.type === "FR" ? "red" : "gray"}>Chưa có</Badge>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
