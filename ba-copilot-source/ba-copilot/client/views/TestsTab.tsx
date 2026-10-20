// Bước 4 "Test case" của "Thực hiện công việc" (đợt 5, C9). Sinh khi FRD-NFR đã Xong (nguồn: UC Specification + FRD-NFR),
// trạng thái Xong / Duyệt / Yêu cầu sửa qua ApprovalBar (kind "tests", id = moduleId), chặn đè bằng tests_rev (409 → ConflictNotice),
// "Đang được sửa bởi …" qua usePresence. `TestsTab` (props cũ { m, reload }) còn để ModuleView cũ biên dịch tới khi C0 dọn.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { approveArtifact, download, get, isConflict, markArtifactDone, post, requestArtifactChange } from "../api.ts";
import type { ArtifactStatus, ModuleDetail, TestCase } from "../../shared/types.ts";
import type { WorkStepProps } from "../projectMenu.ts";
import { usePresence } from "../presence.ts";
import { currentMemberId, useCurrentMember } from "../currentMember.ts";
import { ApprovalBar, Badge, Btn, GitOutcome, ConflictNotice, EditingBadge, Empty, Icon, useUI } from "../components/ui.tsx";

const TYPE_VI: Record<string, [string, string]> = { Positive: ["Tích cực", "green"], Negative: ["Tiêu cực", "red"], Boundary: ["Giá trị biên", "amber"] };

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
      <Empty title="Chưa chọn module">Chọn module ở đầu trang để xem {what}.</Empty>
    </div>
  );
}

/** Bước "Test case". */
export function TestsStep({ moduleId }: WorkStepProps) {
  const { m, reload } = useModuleDetail(moduleId);
  if (!moduleId) return <NoModule what="test case" />;
  if (!m) return <div className="page muted">Đang tải…</div>;
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
        throw new Error("Bộ test vừa được người khác sửa – bấm Tải lại để xem bản mới");
      }
      throw e;
    }
  };

  const generate = async () => {
    if (tests.length && !(await confirm({ title: "Sinh lại test case?", message: "Sinh lại sẽ thay thế toàn bộ test case hiện có và đưa bộ test về Bản nháp.", okLabel: "Sinh lại" }))) return;
    const r = await run("AI đang sinh test case…", () => guard(() => post<TestCase[]>(`/api/modules/${encodeURIComponent(m.id)}/tests/generate`, { baseRev: m.testsRev ?? 0, actorId: currentMemberId() })));
    if (r) {
      toast(`Đã sinh ${r.length} test case`, "ok");
      reload();
    }
  };

  const approval = async (action: "done" | "approve" | "request-change") => {
    const actorId = currentMemberId();
    const r = await run(action === "done" ? "Đang đánh dấu Xong" : action === "approve" ? "Đang duyệt" : "Đang gửi yêu cầu sửa", () =>
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
    else toast(action === "done" ? "Đã đánh dấu Xong – chờ BA Lead duyệt" : action === "approve" ? "Đã duyệt bộ test case" : "Đã gửi yêu cầu sửa", "ok");
    reload();
  };

  const canGenerate = !!ready?.ready;
  const blockReason = ready ? ready.reason : "Đang kiểm tra điều kiện";
  const count = (t: string) => tests.filter((x) => x.type === t).length;

  return (
    <div className="docs" data-testid="tests-step">
      <div className="toolbar">
        <strong>Test case</strong>
        {tests.length > 0 && (
          <span className="muted small">
            {tests.length} test · {count("Positive")} tích cực · {count("Negative")} tiêu cực · {count("Boundary")} biên
          </span>
        )}
        <div className="spacer" />
        {others.length > 0 && <EditingBadge names={others.map((o) => o.name)} />}
        {tests.length > 0 && (
          <Btn size="sm" onClick={() => run("Đang tạo file Excel", () => download(`/api/modules/${encodeURIComponent(m.id)}/export/xlsx`))} data-testid="export-xlsx">
            <Icon name="download" size="sm" />
            Xuất Excel
          </Btn>
        )}
        <Btn kind={tests.length ? "secondary" : "primary"} size="sm" disabled={!canGenerate} onClick={generate} title={canGenerate ? "" : blockReason} data-testid="generate-tests">
          <Icon name="ai" size="sm" />
          {tests.length ? "Sinh lại" : "Sinh test case"}
        </Btn>
      </div>
      {tests.length > 0 && (
        <ApprovalBar
          status={m.testsStatus}
          revisionRequested={m.testsRevisionRequested}
          isLead={isLead}
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
          <strong>Lỗi thời:</strong> tài liệu hoặc prototype đã thay đổi sau lần sinh test case gần nhất. Kiểm tra lại rồi bấm "Sinh lại" (hoặc bấm Xong nếu bộ test vẫn đúng).
        </div>
      )}
      {!canGenerate && ready && tests.length > 0 && (
        <div className="muted small" data-testid="tests-blocked">
          Chưa sinh lại được: {ready.reason}
        </div>
      )}
      {!tests.length ? (
        <Empty title={canGenerate ? "Sẵn sàng sinh test case" : "Chưa sinh được test case"}>
          <span data-testid="tests-empty-reason">
            {canGenerate
              ? "Test case được sinh từ UC Specification và FRD-NFR: mỗi luồng UC (chính, thay thế, ngoại lệ), mỗi yêu cầu chức năng và giá trị biên của các trường có ràng buộc. Mỗi test tham chiếu yêu cầu."
              : `${blockReason}. Vào bước "Tài liệu", hoàn thành FRD-NFR rồi bấm Xong.`}
          </span>
        </Empty>
      ) : (
        <>
          <div className="filters">
            <input placeholder="Tìm theo mã/tiêu đề…" value={q} onChange={(e) => setQ(e.target.value)} />
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">Mọi loại</option>
              <option value="Positive">Tích cực</option>
              <option value="Negative">Tiêu cực</option>
              <option value="Boundary">Giá trị biên</option>
            </select>
            <select value={uc} onChange={(e) => setUc(e.target.value)}>
              <option value="">Mọi Use Case</option>
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
                <th>Mã</th>
                <th>Tiêu đề</th>
                <th>Loại</th>
                <th>Ưu tiên</th>
                <th>UC / Luồng</th>
                <th>Yêu cầu</th>
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
                    <td>{({ High: "Cao", Medium: "TB", Low: "Thấp" } as Record<string, string>)[t.priority]}</td>
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
                            <div className="box-title">Tiền điều kiện</div>
                            {t.preconditions || "—"}
                          </div>
                          <div>
                            <div className="box-title">Dữ liệu test</div>
                            {t.testData || "—"}
                          </div>
                          <div>
                            <div className="box-title">Các bước</div>
                            <ol>
                              {t.steps.map((s, i) => (
                                <li key={i}>{s}</li>
                              ))}
                            </ol>
                          </div>
                          <div>
                            <div className="box-title">Kết quả mong đợi</div>
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
