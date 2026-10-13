import React, { useMemo, useState } from "react";
import { post, download } from "../api.ts";
import type { ModuleDetail } from "../../shared/types.ts";
import { Badge, Btn, Empty, StatusBadge, useUI } from "../components/ui.tsx";

const TYPE_VI: Record<string, [string, string]> = { Positive: ["Tích cực", "green"], Negative: ["Tiêu cực", "red"], Boundary: ["Giá trị biên", "amber"] };

export function TestsTab({ m, reload }: { m: ModuleDetail; reload: () => Promise<unknown> }) {
  const { run, toast } = useUI();
  const [type, setType] = useState("");
  const [uc, setUc] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const tests = m.tests;
  const filtered = useMemo(() => tests.filter((t) => (!type || t.type === type) && (!uc || t.useCaseCode === uc) && (!q || `${t.code} ${t.title}`.toLowerCase().includes(q.toLowerCase()))), [tests, type, uc, q]);

  const generate = async () => {
    if (tests.length && !confirm("Sinh lại sẽ thay thế toàn bộ test case hiện có. Tiếp tục?")) return;
    const r = await run("AI đang sinh test case…", () => post(`/api/modules/${m.id}/tests/generate`));
    if (r) {
      toast(`Đã sinh ${r.length} test case`, "ok");
      reload();
    }
  };
  const ready = m.docsStatus === "approved";
  const count = (t: string) => tests.filter((x) => x.type === t).length;

  return (
    <div className="docs">
      <div className="toolbar">
        <strong>Test case</strong>
        <StatusBadge status={m.testsStatus} />
        {tests.length > 0 && (
          <span className="muted small">
            {tests.length} test · {count("Positive")} tích cực · {count("Negative")} tiêu cực · {count("Boundary")} biên
          </span>
        )}
        <div className="spacer" />
        <Btn kind={tests.length ? "secondary" : "primary"} size="sm" disabled={!ready} onClick={generate} title={!ready ? "Cần duyệt tài liệu trước" : ""} data-testid="generate-tests">
          ✦ {tests.length ? "Sinh lại" : "Sinh test case"}
        </Btn>
        {tests.length > 0 && (
          <Btn size="sm" onClick={() => run("Đang tạo file Excel", () => download(`/api/modules/${m.id}/export/xlsx`))} data-testid="export-xlsx">
            ⤓ Excel
          </Btn>
        )}
      </div>
      {m.testsStatus === "outdated" && <div className="warn-banner">Tài liệu hoặc thiết kế đã thay đổi sau khi sinh test case. Hãy duyệt lại tài liệu và sinh lại.</div>}
      {!tests.length ? (
        <Empty title={ready ? "Sẵn sàng sinh test case" : "Cần duyệt tài liệu trước"}>
          {ready ? "Test case được sinh theo kịch bản cho mọi luồng UC (chính, thay thế, ngoại lệ) và giá trị biên cho các trường có ràng buộc. Mỗi test tham chiếu yêu cầu (BR-04)." : 'Vào tab "2. Tài liệu" để sinh và duyệt tài liệu.'}
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
                      {t.useCaseCode} / {t.flowRef}
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
        </>
      )}
    </div>
  );
}
