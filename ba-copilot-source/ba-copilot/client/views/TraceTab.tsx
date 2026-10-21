// Bước 5 "Truy vết" (đợt 5, C9): ma trận Story → UC → FR → Màn → TC (shared/trace.ts buildTraceMatrix) và các chỗ hở
// (story chưa có UC, FR chưa có màn / chưa có test case…). Liên kết do máy suy luận theo từ khoá được đánh dấu "suy luận".
// `TraceTab` (props cũ { m, reload }) còn để ModuleView cũ biên dịch tới khi C0 dọn.

import React, { useEffect, useState } from "react";
import { get } from "../api.ts";
import type { ModuleDetail } from "../../shared/types.ts";
import type { TraceMatrix } from "../../shared/trace.ts";
import type { WorkStepProps } from "../projectMenu.ts";
import { Badge, Empty, useUI } from "../components/ui.tsx";
import { NoModule, useModuleDetail } from "./TestsTab.tsx";

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

interface TraceData {
  coverage: { flowsWithTests: number; flowsTotal: number };
  screens: { id: string; name: string }[];
  useCases: { code: string; name: string }[];
  stories: { code: string; asA: string; iWant: string; soThat: string }[];
  requirements: { code: string; type: "FR" | "NFR"; statement: string }[];
  tests: { code: string; title: string }[];
  matrix: TraceMatrix;
}

function Meter({ label, a, b, testid }: { label: string; a: number; b: number; testid: string }) {
  const v = pct(a, b);
  const tone = v >= 90 ? "good" : v >= 60 ? "warn" : "bad";
  return (
    <div className="meter" data-testid={testid}>
      <div className="meter-label">{label}</div>
      <div className="meter-value">
        {b ? `${v}%` : "—"} <span className="muted small">({a}/{b})</span>
      </div>
      <div className="meter-bar">
        <div className={`meter-fill ${tone}`} style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

const Missing = () => <Badge tone="red">Missing</Badge>;

/** Bước "Truy vết". */
export function TraceStep({ moduleId }: WorkStepProps) {
  const { m, reload } = useModuleDetail(moduleId);
  if (!moduleId) return <NoModule what="the traceability matrix" />;
  if (!m) return <div className="page muted">Loading…</div>;
  return <TraceTab m={m} reload={reload} />;
}

export function TraceTab({ m }: { m: ModuleDetail; reload?: () => Promise<unknown> }) {
  const { toast } = useUI();
  const [t, setT] = useState<TraceData | null>(null);
  useEffect(() => {
    get<TraceData>(`/api/modules/${encodeURIComponent(m.id)}/trace`)
      .then(setT)
      .catch((e) => toast(e.message, "err"));
  }, [m]);
  if (!t) return <div className="muted pad">Loading…</div>;
  const mx = t.matrix;
  if (!t.stories.length && !t.useCases.length && !t.requirements.length)
    return <Empty title="No traceability data yet">Add user stories to the module and complete the Documents step (UC Specification, FRD-NFR) to see the Story → Use Case → Requirement → Screen → Test Case matrix.</Empty>;

  const screenName = (id: string) => t.screens.find((s) => s.id === id)?.name ?? id;
  const ucName = (code: string) => t.useCases.find((u) => u.code === code)?.name ?? "";
  const req = (code: string) => t.requirements.find((r) => r.code === code);
  const story = (code: string) => t.stories.find((s) => s.code === code);
  const inferredStory = (sc: string, uc: string) => mx.storyLinks[sc]?.find((l) => l.code === uc)?.inferred;
  const g = mx.gaps;
  const gapRows: [string, string[], string][] = [
    ["User stories without a use case", g.storiesWithoutUc, "gap-story"],
    ["Use cases without requirements (FR/NFR)", g.useCasesWithoutFr, "gap-uc"],
    ["FRs not linked to a use case", g.frWithoutUc, "gap-fr-uc"],
    ["FRs without a screen", g.frWithoutScreen, "gap-fr-screen"],
    ["FRs without test cases", g.frWithoutTest, "gap-fr-test"],
    ["Screens not linked to any requirement", g.screensWithoutFr.map(screenName), "gap-screen"],
    ["Test cases with unresolved references", g.testsWithoutReference, "gap-test"],
  ];
  const openGaps = gapRows.filter(([, list]) => list.length);
  let prevStory: string | null | undefined;
  let prevUc: string | null | undefined;

  return (
    <div className="docs" data-testid="trace-step">
      <div className="meters">
        <Meter label="User stories with a use case" a={mx.counts.storiesWithUc} b={mx.counts.stories} testid="cov-story" />
        <Meter label="Functional requirements with a screen" a={mx.counts.frWithScreen} b={mx.counts.frTotal} testid="cov-screen" />
        <Meter label="Functional requirements with tests" a={mx.counts.frWithTest} b={mx.counts.frTotal} testid="cov-fr" />
        <Meter label="Use case flows with tests" a={t.coverage.flowsWithTests} b={t.coverage.flowsTotal} testid="cov-flow" />
      </div>
      {openGaps.length > 0 ? (
        <div className="warn-banner" data-testid="trace-gaps">
          <strong>Gaps to resolve</strong>
          {openGaps.map(([label, list, id]) => (
            <div key={id} data-testid={id}>
              {label}: {list.join(", ")}
            </div>
          ))}
        </div>
      ) : (
        <div className="muted small" data-testid="trace-gaps-none">
          No gaps – every story, use case and functional requirement is linked to screens and test cases.
        </div>
      )}
      <div className="muted small">Links labelled "inferred" were guessed by the system from keywords (not stated explicitly in the documents) – the BA must confirm them.</div>
      <div className="table-wrap">
      <table className="tbl" data-testid="trace-matrix">
        <thead>
          <tr>
            <th>User story</th>
            <th>Use Case</th>
            <th>Requirement</th>
            <th>Screen</th>
            <th>Test case</th>
          </tr>
        </thead>
        <tbody>
          {mx.rows.map((r, i) => {
            const showStory = r.story !== prevStory;
            const showUc = showStory || r.useCase !== prevUc;
            prevStory = r.story;
            prevUc = r.useCase;
            const rq = r.requirement ? req(r.requirement) : undefined;
            const st = r.story ? story(r.story) : undefined;
            const isFr = rq?.type === "FR";
            const warn = (r.story && !r.useCase) || (isFr && (!r.screens.length || !r.tests.length));
            return (
              <tr key={i} className={warn ? "row-warn" : ""}>
                <td>
                  {showStory &&
                    (st ? (
                      <>
                        <span className="strong">{st.code}</span> <span className="muted small">{st.iWant}</span>
                      </>
                    ) : (
                      <span className="muted">—</span>
                    ))}
                </td>
                <td>
                  {showUc &&
                    (r.useCase ? (
                      <>
                        <span className="strong nowrap">{r.useCase}</span> <span className="small">{ucName(r.useCase)}</span>{" "}
                        {r.story && inferredStory(r.story, r.useCase) && <Badge tone="flag">inferred</Badge>}
                      </>
                    ) : r.story ? (
                      <Missing />
                    ) : (
                      <span className="muted">—</span>
                    ))}
                </td>
                <td>
                  {rq ? (
                    <>
                      <span className="strong nowrap">{rq.code}</span> <Badge tone={rq.type === "FR" ? "blue" : "violet"}>{rq.type}</Badge> <span className="small">{rq.statement}</span>
                    </>
                  ) : r.useCase ? (
                    <Missing />
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td>
                  {r.screens.length ? (
                    r.screens.map((s, j) => (
                      <React.Fragment key={s.id}>
                        {j > 0 && ", "}
                        {screenName(s.id)}
                        {s.inferred && (
                          <>
                            {" "}
                            <Badge tone="flag">inferred</Badge>
                          </>
                        )}
                      </React.Fragment>
                    ))
                  ) : isFr ? (
                    <Missing />
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td className="small">{r.tests.length ? r.tests.join(", ") : isFr ? <Missing /> : <span className="muted">—</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}
