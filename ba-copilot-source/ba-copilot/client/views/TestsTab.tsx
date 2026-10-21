// Bước 4 "Test case" của "Thực hiện công việc" (đợt 5, C9). Sinh khi FRD-NFR đã Xong (nguồn: UC Specification + FRD-NFR),
// trạng thái Xong / Duyệt / Yêu cầu sửa qua ApprovalBar (kind "tests", id = moduleId), chặn đè bằng tests_rev (409 → ConflictNotice),
// "Đang được sửa bởi …" qua usePresence. `TestsTab` (props cũ { m, reload }) còn để ModuleView cũ biên dịch tới khi C0 dọn.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { approveArtifact, download, get, isConflict, markArtifactDone, post, requestArtifactChange } from "../api.ts";
import type { ArtifactStatus, ModuleDetail, TestCase } from "../../shared/types.ts";
import { doneBlockReason } from "../../shared/prereq.ts";
import type { WorkStepProps } from "../projectMenu.ts";
import { usePresence } from "../presence.ts";
import { currentMemberId, useCurrentMember } from "../currentMember.ts";
import { SampleBadge, ApprovalBar, Badge, Btn, GitOutcome, ConflictNotice, EditingBadge, Empty, Icon, useUI } from "../components/ui.tsx";

const TYPE_VI: Record<string, [string, string]> = { Positive: ["Positive", "green"], Negative: ["Negative", "red"], Boundary: ["Boundary", "amber"] };

interface Readiness {
  ready: boolean;
  reason: string;
  source: "v5" | "legacy" | null;
  frdStatus: ArtifactStatus;
}

/** Nạp ModuleDetail của module đang chọn cho các bước của C9 (Test case, Truy vết). */
export function useModuleDetail(moduleId: string) {
  const { toast } = useUI();
  const [m, setM] = useState<ModuleDetail | null>(null);
  const reload = useCallback(
    () =>
      get<ModuleDetail>(`/api/modules/${encodeURIComponent(moduleId)}`)
        .then(setM)
        .catch((e) => toast(e.message, "err")),
    [moduleId],
  );
  useEffect(() => {
    setM(null);
    if (moduleId) reload();
  }, [reload, moduleId]);
  return { m: m && m.id === moduleId ? m : null, reload };
}

export function NoModule({ what }: { what: string }) {
  return (
    <div className="page">
      <Empty title="No module selected">Select a module at the top of the page to see {what}.</Empty>
    </div>
  );
}

/** Bước "Test case". */
export function TestsStep({ moduleId }: WorkStepProps) {
  const { m, reload } = useModuleDetail(moduleId);
  if (!moduleId) return <NoModule what="test case" />;
  if (!m) return <div className="page muted">Loading…</div>;
  return <TestsTab m={m} reload={reload} />;
}

export function TestsTab({ m, reload }: { m: ModuleDetail; reload: () => Promise<unknown> }) {
  const { run, toast, confirm } = useUI();
  const { me } = useCurrentMember();
  const isLead = me?.role === "BA_LEAD";
  const others = usePresence("tests", m.id);
  const [type, setType] = useState("");
  const [uc, setUc] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [ready, setReady] = useState<Readiness | null>(null);
  const tests: TestCase[] = m.tests;
  const filtered = useMemo(() => tests.filter((t) => (!type || t.type === type) && (!uc || t.useCaseCode === uc) && (!q || `${t.code} ${t.title}`.toLowerCase().includes(q.toLowerCase()))), [tests, type, uc, q]);

  useEffect(() => {
    get<Readiness>(`/api/modules/${encodeURIComponent(m.id)}/tests/readiness`)
      .then(setReady)
      .catch(() => setReady(null));
  }, [m]);

  const guard = async <T,>(fn: () => Promise<T>) => {
    try {
      return await fn();
    } catch (e) {
      if (isConflict(e)) {
        setConflict(true);
        throw new Error("Someone else just edited the test suite – click Reload to see the latest version");
      }
      throw e;
    }
  };

  const generate = async () => {
    if (tests.length && !(await confirm({ title: "Regenerate test cases?", message: "Regenerating replaces all current test cases and returns the test suite to Draft.", okLabel: "Regenerate" }))) return;
    const r = await run("AI is generating test cases…", () => guard(() => post<TestCase[]>(`/api/modules/${encodeURIComponent(m.id)}/tests/generate`, { baseRev: m.testsRev ?? 0, actorId: currentMemberId() })));
    if (r) {
      toast(`${r.length} test case(s) generated`, "ok");
      reload();
    }
  };

  const approval = async (action: "done" | "approve" | "request-change") => {
    const actorId = currentMemberId();
    const r = await run(action === "done" ? "Marking as done" : action === "approve" ? "Approving" : "Requesting changes", () =>
      guard(() =>
        action === "done"
          ? markArtifactDone("tests", m.id, { baseRev: m.testsRev, actorId })
          : action === "approve"
            ? approveArtifact("tests", m.id, { baseRev: m.testsRev, actorId })
            : requestArtifactChange("tests", m.id, { actorId }),
      ),
    );
    if (!r) return;
    if (action === "approve" && r.git) toast(<GitOutcome git={r.git} />, r.git.pushed ? "ok" : "info");
    else toast(action === "done" ? "Marked as done – awaiting BA Lead approval" : action === "approve" ? "Test suite approved" : "Changes requested", "ok");
    reload();
  };

  const canGenerate = !!ready?.ready;
  const blockReason = ready ? ready.reason : "Checking prerequisites";
  // Nút Xong khoá khi FRD-NFR chưa Xong (cùng luật với nút Sinh – shared/prereq.ts, giữ nhánh legacy); server cũng chặn.
  const doneLock =
    ready && (m.testsStatus === "draft" || m.testsStatus === "outdated")
      ? (doneBlockReason({ kind: "tests" }, { docStatus: (k) => (k === "FRD_NFR" ? ready.frdStatus : undefined), legacyDocsApproved: m.docsStatus === "approved" }) ?? undefined)
      : undefined;
  const count = (t: string) => tests.filter((x) => x.type === t).length;

  return (
    <div className="docs" data-testid="tests-step">
      <div className="toolbar">
        <strong>Test case</strong>
        {tests.length > 0 && (
          <span className="muted small">
            {tests.length} {tests.length === 1 ? "test" : "tests"} · {count("Positive")} positive · {count("Negative")} negative · {count("Boundary")} boundary
          </span>
        )}
        <div className="spacer" />
        {others.length > 0 && <EditingBadge names={others.map((o) => o.name)} />}
        {tests.length > 0 && (
          <Btn size="sm" onClick={() => run("Creating the Excel file", () => download(`/api/modules/${encodeURIComponent(m.id)}/export/xlsx`))} data-testid="export-xlsx">
            <Icon name="download" size="sm" />
            Export Excel
          </Btn>
        )}
        <SampleBadge />
        <Btn kind={tests.length ? "secondary" : "primary"} size="sm" disabled={!canGenerate} onClick={generate} title={canGenerate ? "" : blockReason} data-testid="generate-tests">
          <Icon name={tests.length ? "regenerate" : "ai"} size="sm" />
          {tests.length ? "Regenerate" : "Generate test cases"}
        </Btn>
      </div>
      {tests.length > 0 && (
        <ApprovalBar
          status={m.testsStatus}
          revisionRequested={m.testsRevisionRequested}
          isLead={isLead}
          disabledReason={doneLock}
          onDone={() => approval("done")}
          onApprove={() => approval("approve")}
          onRequestChange={() => approval("request-change")}
          testId="tests-approval"
        />
      )}
      {conflict && (
        <ConflictNotice
          onReload={async () => {
            await reload();
            setConflict(false);
          }}
        />
      )}
      {m.testsStatus === "outdated" && (
        <div className="warn-banner" data-testid="tests-outdated">
          <strong>Outdated:</strong> the documents or prototype changed after the test cases were last generated. Review them, then click "Regenerate" (or mark as done if the test suite is still correct).
        </div>
      )}
      {!canGenerate && ready && tests.length > 0 && (
        <div className="muted small" data-testid="tests-blocked">
          Cannot regenerate yet: {ready.reason}
        </div>
      )}
      {!tests.length ? (
        <Empty title={canGenerate ? "Ready to generate test cases" : "Test cases cannot be generated yet"}>
          <span data-testid="tests-empty-reason">
            {canGenerate
              ? "Test cases are generated from the UC Specification and FRD-NFR: every use case flow (main, alternative, exception), every functional requirement and the boundary values of constrained fields. Every test references a requirement."
              : `${blockReason}. Go to the "Documents" step, complete the FRD-NFR and mark it as done.`}
          </span>
        </Empty>
      ) : (
        <>
          <div className="filters">
            <input placeholder="Search by ID/title…" value={q} onChange={(e) => setQ(e.target.value)} />
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">All types</option>
              <option value="Positive">Positive</option>
              <option value="Negative">Negative</option>
              <option value="Boundary">Boundary</option>
            </select>
            <select value={uc} onChange={(e) => setUc(e.target.value)}>
              <option value="">All use cases</option>
              {m.docs.useCases.map((u) => (
                <option key={u.code} value={u.code}>
                  {u.code} – {u.name}
                </option>
              ))}
            </select>
          </div>
          <div className="table-wrap">
          <table className="tbl tbl-tests">
            <thead>
              <tr>
                <th>ID</th>
                <th>Title</th>
                <th>Type</th>
                <th>Priority</th>
                <th>UC / Flow</th>
                <th>Requirements</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <React.Fragment key={t.code}>
                  <tr className="clickable" onClick={() => setOpen(open === t.code ? null : t.code)}>
                    <td className="nowrap strong">{t.code}</td>
                    <td>{t.title}</td>
                    <td>
                      <Badge tone={TYPE_VI[t.type]?.[1]}>{TYPE_VI[t.type]?.[0] ?? t.type}</Badge>
                    </td>
                    <td>{({ High: "High", Medium: "Medium", Low: "Low" } as Record<string, string>)[t.priority]}</td>
                    <td className="nowrap">
                      {t.useCaseCode || "—"} / {t.flowRef}
                    </td>
                    <td className="nowrap">{t.requirementCodes.join(", ")}</td>
                  </tr>
                  {open === t.code && (
                    <tr className="detail-row">
                      <td colSpan={6}>
                        <div className="tc-detail">
                          <div>
                            <div className="box-title">Preconditions</div>
                            {t.preconditions || "—"}
                          </div>
                          <div>
                            <div className="box-title">Test Data</div>
                            {t.testData || "—"}
                          </div>
                          <div>
                            <div className="box-title">Test Steps</div>
                            <ol>
                              {t.steps.map((s, i) => (
                                <li key={i}>{s}</li>
                              ))}
                            </ol>
                          </div>
                          <div>
                            <div className="box-title">Expected Result</div>
                            {t.expected}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
          </div>
        </>
      )}
    </div>
  );
}
