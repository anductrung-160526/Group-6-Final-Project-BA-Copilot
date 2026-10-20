import React, { useEffect, useState } from "react";
import { post, download } from "../api.ts";
import type { ModuleDetail, UseCase } from "../../shared/types.ts";
import { Badge, Btn, Empty, StatusBadge, useUI } from "../components/ui.tsx";
import { Markdown } from "../components/Markdown.tsx";
import { Mermaid } from "../components/Mermaid.tsx";
import { RelatedTasks } from "../components/RelatedTasks.tsx";

type Sub = "uc" | "srs" | "seq" | "req";

export function DocsTab({ m, reload }: { m: ModuleDetail; reload: () => Promise<unknown> }) {
  const { run, toast, confirm } = useUI();
  const [sub, setSub] = useState<Sub>("uc");
  const [ucCode, setUcCode] = useState<string | null>(null);
  const [srsKey, setSrsKey] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");
  const docs = m.docs;
  const approvedScreens = m.screens.filter((s) => s.status === "approved");
  const screenName = (id: string) => m.screens.find((s) => s.id === id)?.name ?? id;

  useEffect(() => {
    if (!docs.useCases.find((u) => u.code === ucCode)) setUcCode(docs.useCases[0]?.code ?? null);
    if (docs.srs && !docs.srs.sections.find((s) => s.key === srsKey)) setSrsKey(docs.srs.sections[0]?.key ?? null);
  }, [docs]);

  const generate = async () => {
    if (m.docsStatus !== "none" && !(await confirm({ title: "Sinh lại tài liệu?", message: "Sinh lại sẽ thay thế toàn bộ UC, SRS và sequence hiện có.", okLabel: "Sinh lại" }))) return;
    const r = await run("AI đang phân tích thiết kế và viết UC, SRS, Sequence…", () => post(`/api/modules/${m.id}/docs/generate`));
    if (r) {
      toast(`Đã sinh ${r.useCases.length} Use Case, ${r.requirements.length} yêu cầu, ${r.sequences.length} sơ đồ`, "ok");
      reload();
    }
  };

  const target = sub === "uc" ? ucCode : sub === "seq" ? (ucCode ? `SEQ:${ucCode}` : null) : sub === "srs" ? (srsKey ? `SRS:${srsKey}` : null) : null;
  const refine = async () => {
    if (!target || !instruction.trim()) return;
    const r = await run("AI đang chỉnh tài liệu…", () => post(`/api/modules/${m.id}/docs/refine`, { target, instruction }));
    if (r) {
      setInstruction("");
      toast("Đã cập nhật", "ok");
      reload();
    }
  };

  const uc = docs.useCases.find((u) => u.code === ucCode) ?? null;
  const seq = docs.sequences.find((s) => s.useCaseCode === ucCode) ?? null;
  const section = docs.srs?.sections.find((s) => s.key === srsKey) ?? null;

  return (
    <div className="docs">
      <div className="toolbar">
        <strong>Tài liệu</strong>
        <StatusBadge status={m.docsStatus} />
        <span className="muted small">Nguồn: {approvedScreens.length} màn hình đã duyệt</span>
        <div className="spacer" />
        <Btn kind={m.docsStatus === "none" ? "primary" : "secondary"} size="sm" disabled={!approvedScreens.length} onClick={generate} data-testid="generate-docs" title={!approvedScreens.length ? "BR-01: cần duyệt ít nhất 1 màn hình" : ""}>
          ✦ {m.docsStatus === "none" ? "Sinh tài liệu" : "Sinh lại"}
        </Btn>
        {m.docsStatus !== "none" && (
          <>
            {m.docsStatus === "approved" ? (
              <Btn size="sm" onClick={() => run("Đang cập nhật", () => post(`/api/modules/${m.id}/docs/approve`, { approved: false })).then(reload)}>
                Bỏ duyệt
              </Btn>
            ) : (
              <Btn size="sm" kind="primary" onClick={() => run("Đang cập nhật", () => post(`/api/modules/${m.id}/docs/approve`, { approved: true })).then(() => { toast("Đã duyệt tài liệu – có thể sinh test case", "ok"); reload(); })} data-testid="approve-docs">
                ✓ Duyệt tài liệu
              </Btn>
            )}
            <Btn size="sm" onClick={() => run("Đang tạo file Word", () => download(`/api/modules/${m.id}/export/docx`))} data-testid="export-docx">
              ⤓ Word
            </Btn>
          </>
        )}
      </div>
      {m.docsStatus === "outdated" && <div className="warn-banner">Thiết kế đã thay đổi sau khi sinh tài liệu (BR-02). Hãy duyệt lại màn hình và bấm "Sinh lại" để cập nhật.</div>}
      <RelatedTasks kind="docs" id={m.id} />

      {m.docsStatus === "none" ? (
        <Empty title={approvedScreens.length ? "Sẵn sàng sinh tài liệu" : "Cần duyệt thiết kế trước (BR-01)"}>
          {approvedScreens.length
            ? "Hệ thống trích mô hình trung gian (trường, ràng buộc, thao tác, điều hướng) từ các màn hình đã duyệt rồi sinh Use Case, SRS và Sequence diagram."
            : 'Vào tab "1. Thiết kế", chọn màn hình và bấm "Duyệt thiết kế".'}
        </Empty>
      ) : (
        <>
          <div className="seg">
            {(
              [
                ["uc", `Use Case (${docs.useCases.length})`],
                ["srs", "SRS"],
                ["seq", `Sequence (${docs.sequences.length})`],
                ["req", `Yêu cầu (${docs.requirements.length})`],
              ] as [Sub, string][]
            ).map(([k, l]) => (
              <button key={k} className={sub === k ? "on" : ""} onClick={() => setSub(k)} data-testid={`docs-${k}`}>
                {l}
              </button>
            ))}
          </div>

          <div className="doc-layout">
            {sub !== "req" && (
              <nav className="doc-nav">
                {sub === "srs"
                  ? docs.srs?.sections.map((s) => (
                      <button key={s.key} className={s.key === srsKey ? "on" : ""} onClick={() => setSrsKey(s.key)}>
                        {s.title}
                      </button>
                    ))
                  : docs.useCases.map((u) => (
                      <button key={u.code} className={u.code === ucCode ? "on" : ""} onClick={() => setUcCode(u.code)}>
                        <span className="code-tag">{u.code}</span> {u.name}
                      </button>
                    ))}
              </nav>
            )}
            <div className="doc-main">
              {sub === "uc" && uc && <UseCaseView uc={uc} screenName={screenName} moduleId={m.id} />}
              {sub === "srs" && section && (
                <article className="paper">
                  <h2>{section.title}</h2>
                  <Markdown text={section.content} />
                </article>
              )}
              {sub === "seq" &&
                (seq ? (
                  <article className="paper">
                    <h2>{seq.title}</h2>
                    <Mermaid code={seq.mermaid} name={seq.useCaseCode} />
                    <details>
                      <summary className="muted small">Mã Mermaid</summary>
                      <pre className="code">{seq.mermaid}</pre>
                    </details>
                  </article>
                ) : (
                  <Empty title="Chưa có sơ đồ cho UC này" />
                ))}
              {sub === "req" && (
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Mã</th>
                      <th>Loại</th>
                      <th>Yêu cầu</th>
                      <th>Ưu tiên</th>
                      <th>Use Case</th>
                      <th>Nguồn</th>
                    </tr>
                  </thead>
                  <tbody>
                    {docs.requirements.map((r) => (
                      <tr key={r.code}>
                        <td className="nowrap strong">{r.code}</td>
                        <td>
                          <Badge tone={r.type === "FR" ? "blue" : "violet"}>{r.type}</Badge>
                        </td>
                        <td>
                          {r.statement} {r.isAssumption && <Badge tone="amber">Giả định</Badge>}
                        </td>
                        <td>{({ High: "Cao", Medium: "TB", Low: "Thấp" } as Record<string, string>)[r.priority]}</td>
                        <td className="nowrap">{r.useCaseCodes.join(", ")}</td>
                        <td className="muted small">{r.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {target && (
                <div className="refine">
                  <div className="box-title">Prompt chỉnh {sub === "srs" ? `mục "${section?.title}"` : sub === "seq" ? `sơ đồ ${ucCode}` : ucCode}</div>
                  <div className="refine-row">
                    <textarea rows={2} value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder={sub === "uc" ? "VD: Thêm ngoại lệ khóa tài khoản sau 5 lần nhập sai mật khẩu" : sub === "seq" ? "VD: Thêm bước gửi email xác nhận" : "VD: Bổ sung yêu cầu bảo mật OWASP"} data-testid="refine-input" />
                    <Btn kind="primary" disabled={!instruction.trim()} onClick={refine} data-testid="refine-btn">
                      ✦ Chỉnh
                    </Btn>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function UseCaseView({ uc, screenName, moduleId }: { uc: UseCase; screenName: (id: string) => string; moduleId: string }) {
  const flow = (f: UseCase["altFlows"][number]) => (
    <div key={f.code} className="flow">
      <strong>
        {f.code}. {f.name}
      </strong>{" "}
      <span className="muted small">(rẽ nhánh từ bước {f.branchFrom})</span>
      <ol>
        {f.steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
    </div>
  );
  const rows: [string, React.ReactNode][] = [
    ["Tác nhân", uc.actors.join(", ")],
    ["Mô tả", uc.description],
    ["Sự kiện kích hoạt", uc.trigger],
    ["Tiền điều kiện", <ul>{uc.preconditions.map((x, i) => <li key={i}>{x}</li>)}</ul>],
    ["Hậu điều kiện", <ul>{uc.postconditions.map((x, i) => <li key={i}>{x}</li>)}</ul>],
    [
      "Luồng chính",
      <ol className="main-flow">
        {uc.mainFlow.map((s) => (
          <li key={s.no}>
            <span className={`actor ${s.actor === "Hệ thống" ? "sys" : ""}`}>{s.actor}</span> {s.text}
            {s.screenId && (
              <a className="screen-link" href={`#/m/${moduleId}/design`} title="Mở màn hình">
                ↗ {screenName(s.screenId)}
              </a>
            )}
          </li>
        ))}
      </ol>,
    ],
    ["Luồng thay thế", uc.altFlows.length ? uc.altFlows.map(flow) : "—"],
    ["Ngoại lệ", uc.exceptions.length ? uc.exceptions.map(flow) : "—"],
    ["Quy tắc nghiệp vụ", uc.businessRules.length ? <ul>{uc.businessRules.map((x, i) => <li key={i}>{x}</li>)}</ul> : "—"],
    ["Màn hình", uc.screenIds.map(screenName).join(", ") || "—"],
  ];
  return (
    <article className="paper">
      <h2>
        {uc.code}: {uc.name}
      </h2>
      <table className="spec">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <th>{k}</th>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {uc.assumptions.length > 0 && (
        <div className="assume">
          <strong>Giả định – cần BA xác nhận (BR-03)</strong>
          <ul>
            {uc.assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}
