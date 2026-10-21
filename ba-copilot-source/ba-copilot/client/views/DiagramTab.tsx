// SCR-05 – Tab Sơ đồ UC (FN-11 → FN-14). Chủ sở hữu: A5.
// Trái: soạn mã Mermaid. Phải: xem trước, vẽ lại sau 400 ms kể từ lần gõ cuối.

import React, { useEffect, useState } from "react";
import { approveDiagram, generateDiagram, getDiagram, saveDiagram } from "../api.ts";
import { currentMemberId } from "../currentMember.ts";
import type { UcDiagram } from "../../shared/types.ts";
import { SampleBadge, Btn, Empty, Icon, StatusBadge, useUI } from "../components/ui.tsx";
import { Mermaid } from "../components/Mermaid.tsx";
import type { ModuleTabProps } from "./moduleTabs.ts";

const PREVIEW_DELAY_MS = 400;
// UcDiagramStatus → nhãn có sẵn của StatusBadge ("stale" hiện là Bản cũ).
const badgeStatus = (d: UcDiagram | null) => (!d ? "none" : d.status === "stale" ? "outdated" : d.status);

export function DiagramTab({ m }: ModuleTabProps) {
  const { run, toast, confirm } = useUI();
  const [diagram, setDiagram] = useState<UcDiagram | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState("");
  const hasUc = m.docs.useCases.length > 0;
  const dirty = !!diagram && code !== diagram.code;

  const apply = (d: UcDiagram | null) => {
    setDiagram(d);
    setCode(d?.code ?? "");
    setPreview(d?.code ?? "");
  };

  useEffect(() => {
    let alive = true;
    setLoaded(false);
    getDiagram(m.id)
      .then((d) => alive && apply(d))
      .catch((e: Error) => alive && toast(e.message, "err"))
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, [m.id, m.docsStatus]);

  useEffect(() => {
    const t = setTimeout(() => setPreview(code), PREVIEW_DELAY_MS);
    return () => clearTimeout(t);
  }, [code]);

  const generate = async () => {
    if (diagram && !(await confirm({ title: "Regenerate the use case diagram?", message: dirty ? "Regenerating replaces the unsaved code you are editing." : "Regenerating replaces the current diagram.", okLabel: "Regenerate" }))) return;
    const d = await run("AI is drawing the use case diagram…", () => generateDiagram(m.id, currentMemberId()));
    if (d) {
      apply(d);
      toast("Use case diagram generated", "ok");
    }
  };

  const save = async () => {
    const d = await run("Saving diagram", () => saveDiagram(m.id, code, currentMemberId()));
    if (d) {
      apply(d);
      toast(diagram?.status === "approved" ? "Saved – the diagram is back to Draft and must be approved again" : "Diagram saved", "ok");
    }
  };

  const approve = async (ok: boolean) => {
    const d = await run("Updating", () => approveDiagram(m.id, ok, currentMemberId()));
    if (d) {
      apply(d);
      toast(ok ? "Diagram approved" : "Diagram approval withdrawn", "ok");
    }
  };

  return (
    <div className="docs" data-testid="diagram-tab">
      <div className="toolbar">
        <strong>Use Case Diagram</strong>
        <StatusBadge status={badgeStatus(diagram)} />
        {dirty && <span className="muted small">Unsaved changes</span>}
        <div className="spacer" />
        {loaded && (
          <>
            <SampleBadge />
            <Btn kind={diagram ? "secondary" : "primary"} size="sm" disabled={!hasUc} onClick={generate} data-testid="generate-diagram" title={hasUc ? "" : "Generate the documents (use cases) first"}>
              <Icon name={diagram ? "regenerate" : "ai"} size="sm" />
              {diagram ? "Regenerate" : "Generate diagram"}
            </Btn>
            {diagram && (
              <>
                <Btn size="sm" disabled={!dirty || !code.trim()} onClick={save} data-testid="save-diagram">
                  Save code
                </Btn>
                {diagram.status === "approved" ? (
                  <Btn size="sm" onClick={() => approve(false)} data-testid="unapprove-diagram">
                    Withdraw approval
                  </Btn>
                ) : (
                  <Btn size="sm" kind="primary" disabled={dirty} title={dirty ? "Save the code before approving" : ""} onClick={() => approve(true)} data-testid="approve-diagram">
                    ✓ Approve diagram
                  </Btn>
                )}
              </>
            )}
          </>
        )}
      </div>
      {diagram?.status === "stale" && <div className="warn-banner">The use cases changed after this diagram was drawn (FN-14). Click "Regenerate" or edit the code to match, then save and approve again.</div>}

      {!loaded ? null : !diagram ? (
        <Empty title={hasUc ? "Ready to generate the use case diagram" : "Generate the documents first"}>
          {hasUc
            ? `The module has ${m.docs.useCases.length} use case(s). Click "Generate diagram" to let the AI draw it; you can then edit the code and approve.`
            : 'The diagram is drawn from the use cases. Open the "2. Documents" tab and generate the documents first.'}
        </Empty>
      ) : (
        <div className="split-2">
          <div className="box">
            <div className="box-title">Mermaid code</div>
            <textarea value={code} onChange={(e) => setCode(e.target.value)} rows={24} spellCheck={false} aria-label="Diagram Mermaid code" data-testid="diagram-code" />
            <span className="muted small">Actors are circles (( )), use cases are ellipses ([ ]). Relationships: A -.-&gt;|"«include»"| B.</span>
          </div>
          <div className="box">
            <div className="box-title">Preview</div>
            {preview.trim() ? <Mermaid code={preview} name={`diagram-uc-${m.name}`} title="Use case diagram" /> : <Empty title="No code to render yet" />}
          </div>
        </div>
      )}
    </div>
  );
}
