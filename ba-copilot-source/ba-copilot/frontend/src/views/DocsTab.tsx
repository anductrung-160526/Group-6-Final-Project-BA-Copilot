import React, { useEffect, useState } from "react";
import { post, download } from "../api.ts";
import type { ModuleDetail, UseCase } from "../../../shared/types.ts";
import { SampleBadge, Badge, Btn, Empty, Icon, StatusBadge, useUI } from "../components/ui.tsx";
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
    if (m.docsStatus !== "none" && !(await confirm({ title: "Regenerate the documents?", message: "Regenerating replaces all current use cases, the SRS and the sequence diagrams.", okLabel: "Regenerate" }))) return;
    const r = await run("AI is analysing the design and writing the use cases, SRS and sequence diagrams…", () => post(`/api/modules/${m.id}/docs/generate`));
    if (r) {
      toast(`Generated ${r.useCases.length} use case(s), ${r.requirements.length} requirement(s), ${r.sequences.length} diagram(s)`, "ok");
      reload();
    }
  };

  const target = sub === "uc" ? ucCode : sub === "seq" ? (ucCode ? `SEQ:${ucCode}` : null) : sub === "srs" ? (srsKey ? `SRS:${srsKey}` : null) : null;
  const refine = async () => {
    if (!target || !instruction.trim()) return;
    const r = await run("AI is refining the document…", () => post(`/api/modules/${m.id}/docs/refine`, { target, instruction }));
    if (r) {
      setInstruction("");
      toast("Updated", "ok");
      reload();
    }
  };

  const uc = docs.useCases.find((u) => u.code === ucCode) ?? null;
  const seq = docs.sequences.find((s) => s.useCaseCode === ucCode) ?? null;
  const section = docs.srs?.sections.find((s) => s.key === srsKey) ?? null;

  return (
    <div className="docs">
      <div className="toolbar">
        <strong>Documents</strong>
        <StatusBadge status={m.docsStatus} />
        <span className="muted small">Source: {approvedScreens.length} approved screen(s)</span>
        <div className="spacer" />
        <SampleBadge />
        <Btn kind={m.docsStatus === "none" ? "primary" : "secondary"} size="sm" disabled={!approvedScreens.length} onClick={generate} data-testid="generate-docs" title={!approvedScreens.length ? "BR-01: at least 1 screen must be approved" : ""}>
          <Icon name={m.docsStatus === "none" ? "ai" : "regenerate"} size="sm" />
          {m.docsStatus === "none" ? "Generate documents" : "Regenerate"}
        </Btn>
        {m.docsStatus !== "none" && (
          <>
            {m.docsStatus === "approved" ? (
              <Btn size="sm" onClick={() => run("Updating", () => post(`/api/modules/${m.id}/docs/approve`, { approved: false })).then(reload)}>
                Withdraw approval
              </Btn>
            ) : (
              <Btn size="sm" kind="primary" onClick={() => run("Updating", () => post(`/api/modules/${m.id}/docs/approve`, { approved: true })).then(() => { toast("Documents approved – test cases can now be generated", "ok"); reload(); })} data-testid="approve-docs">
                ✓ Approve documents
              </Btn>
            )}
            <Btn size="sm" onClick={() => run("Creating the Word file", () => download(`/api/modules/${m.id}/export/docx`))} data-testid="export-docx">
              ⤓ Word
            </Btn>
          </>
        )}
      </div>
      {m.docsStatus === "outdated" && <div className="warn-banner">The design changed after the documents were generated (BR-02). Approve the screens again and click "Regenerate" to update.</div>}
      <RelatedTasks kind="docs" id={m.id} />

      {m.docsStatus === "none" ? (
        <Empty title={approvedScreens.length ? "Ready to generate documents" : "Approve the design first (BR-01)"}>
          {approvedScreens.length
            ? "The system extracts an intermediate model (fields, constraints, actions, navigation) from the approved screens and then generates the use cases, SRS and sequence diagrams."
            : 'Open the "1. Design" tab, select a screen and click "Approve design".'}
        </Empty>
      ) : (
        <>
          <div className="seg">
            {(
              [
                ["uc", `Use Case (${docs.useCases.length})`],
                ["srs", "SRS"],
                ["seq", `Sequence (${docs.sequences.length})`],
                ["req", `Requirements (${docs.requirements.length})`],
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
                    <Mermaid code={seq.mermaid} name={seq.useCaseCode} title={`Sequence diagram – ${seq.useCaseCode}`} />
                    <details>
                      <summary className="muted small">Mermaid code</summary>
                      <pre className="code">{seq.mermaid}</pre>
                    </details>
                  </article>
                ) : (
                  <Empty title="No diagram for this use case yet" />
                ))}
              {sub === "req" && (
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Type</th>
                      <th>Requirement</th>
                      <th>Priority</th>
                      <th>Use Case</th>
                      <th>Source</th>
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
                          {r.statement} {r.isAssumption && <Badge tone="amber">Assumption</Badge>}
                        </td>
                        <td>{({ High: "High", Medium: "Medium", Low: "Low" } as Record<string, string>)[r.priority]}</td>
                        <td className="nowrap">{r.useCaseCodes.join(", ")}</td>
                        <td className="muted small">{r.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {target && (
                <div className="refine">
                  <div className="box-title">Refinement prompt for {sub === "srs" ? `section "${section?.title}"` : sub === "seq" ? `the ${ucCode} diagram` : ucCode}</div>
                  <div className="refine-row">
                    <textarea rows={2} value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder={sub === "uc" ? "e.g. Add an exception that locks the account after 5 wrong password attempts" : sub === "seq" ? "e.g. Add a step that sends a confirmation email" : "e.g. Add OWASP security requirements"} data-testid="refine-input" />
                    <Btn kind="primary" disabled={!instruction.trim()} onClick={refine} data-testid="refine-btn">
                      ✦ Refine
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
      <span className="muted small">(branches from step {f.branchFrom})</span>
      <ol>
        {f.steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
    </div>
  );
  const rows: [string, React.ReactNode][] = [
    ["Actors", uc.actors.join(", ")],
    ["Description", uc.description],
    ["Trigger", uc.trigger],
    ["Preconditions", <ul>{uc.preconditions.map((x, i) => <li key={i}>{x}</li>)}</ul>],
    ["Postconditions", <ul>{uc.postconditions.map((x, i) => <li key={i}>{x}</li>)}</ul>],
    [
      "Main flow",
      <ol className="main-flow">
        {uc.mainFlow.map((s) => (
          <li key={s.no}>
            {/* vi-keep: actor "Hệ thống" trong UC cũ */}
            <span className={`actor ${/^(?:system|hệ thống)$/i.test(s.actor) ? "sys" : ""}`}>{s.actor}</span> {s.text}
            {s.screenId && (
              <a className="screen-link" href={`#/m/${moduleId}/design`} title="Open screen">
                ↗ {screenName(s.screenId)}
              </a>
            )}
          </li>
        ))}
      </ol>,
    ],
    ["Alternative flows", uc.altFlows.length ? uc.altFlows.map(flow) : "—"],
    ["Exception flows", uc.exceptions.length ? uc.exceptions.map(flow) : "—"],
    ["Business rules", uc.businessRules.length ? <ul>{uc.businessRules.map((x, i) => <li key={i}>{x}</li>)}</ul> : "—"],
    ["Screens", uc.screenIds.map(screenName).join(", ") || "—"],
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
          <strong>Assumptions – to be confirmed by the BA (BR-03)</strong>
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
