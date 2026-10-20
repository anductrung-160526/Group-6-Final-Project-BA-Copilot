// SCR-05 – Tab Sơ đồ UC (FN-11 → FN-14). Chủ sở hữu: A5.
// Trái: soạn mã Mermaid. Phải: xem trước, vẽ lại sau 400 ms kể từ lần gõ cuối.

import React, { useEffect, useState } from "react";
import { approveDiagram, generateDiagram, getDiagram, saveDiagram } from "../api.ts";
import { currentMemberId } from "../currentMember.ts";
import type { UcDiagram } from "../../shared/types.ts";
import { Btn, Empty, StatusBadge, useUI } from "../components/ui.tsx";
import { Mermaid } from "../components/Mermaid.tsx";
import type { ModuleTabProps } from "./moduleTabs.ts";

const PREVIEW_DELAY_MS = 400;
// UcDiagramStatus → nhãn có sẵn của StatusBadge ("stale" hiện là Lỗi thời).
const badgeStatus = (d: UcDiagram | null) => (!d ? "none" : d.status === "stale" ? "outdated" : d.status);

export function DiagramTab({ m }: ModuleTabProps) {
  const { run, toast } = useUI();
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
    if (diagram && !confirm(dirty ? "Sinh lại sẽ thay mã đang sửa chưa lưu. Tiếp tục?" : "Sinh lại sẽ thay sơ đồ hiện có. Tiếp tục?")) return;
    const d = await run("AI đang vẽ sơ đồ Use Case…", () => generateDiagram(m.id, currentMemberId()));
    if (d) {
      apply(d);
      toast("Đã sinh sơ đồ Use Case", "ok");
    }
  };

  const save = async () => {
    const d = await run("Đang lưu sơ đồ", () => saveDiagram(m.id, code, currentMemberId()));
    if (d) {
      apply(d);
      toast(diagram?.status === "approved" ? "Đã lưu – sơ đồ trở về Bản nháp, cần duyệt lại" : "Đã lưu sơ đồ", "ok");
    }
  };

  const approve = async (ok: boolean) => {
    const d = await run("Đang cập nhật", () => approveDiagram(m.id, ok, currentMemberId()));
    if (d) {
      apply(d);
      toast(ok ? "Đã duyệt sơ đồ" : "Đã bỏ duyệt sơ đồ", "ok");
    }
  };

  return (
    <div className="docs" data-testid="diagram-tab">
      <div className="toolbar">
        <strong>Sơ đồ Use Case</strong>
        <StatusBadge status={badgeStatus(diagram)} />
        {dirty && <span className="muted small">Có thay đổi chưa lưu</span>}
        <div className="spacer" />
        {loaded && (
          <>
            <Btn kind={diagram ? "secondary" : "primary"} size="sm" disabled={!hasUc} onClick={generate} data-testid="generate-diagram" title={hasUc ? "" : "Cần sinh tài liệu (Use Case) trước"}>
              ✦ {diagram ? "Sinh lại" : "Sinh sơ đồ"}
            </Btn>
            {diagram && (
              <>
                <Btn size="sm" disabled={!dirty || !code.trim()} onClick={save} data-testid="save-diagram">
                  Lưu mã
                </Btn>
                {diagram.status === "approved" ? (
                  <Btn size="sm" onClick={() => approve(false)} data-testid="unapprove-diagram">
                    Bỏ duyệt
                  </Btn>
                ) : (
                  <Btn size="sm" kind="primary" disabled={dirty} title={dirty ? "Lưu mã trước khi duyệt" : ""} onClick={() => approve(true)} data-testid="approve-diagram">
                    ✓ Duyệt sơ đồ
                  </Btn>
                )}
              </>
            )}
          </>
        )}
      </div>
      {diagram?.status === "stale" && <div className="warn-banner">Use Case đã thay đổi sau khi vẽ sơ đồ (FN-14). Hãy bấm "Sinh lại" hoặc sửa mã cho khớp rồi lưu và duyệt lại.</div>}

      {!loaded ? null : !diagram ? (
        <Empty title={hasUc ? "Sẵn sàng sinh sơ đồ Use Case" : "Cần sinh tài liệu trước"}>
          {hasUc
            ? `Module có ${m.docs.useCases.length} Use Case. Bấm "Sinh sơ đồ" để AI vẽ sơ đồ, sau đó bạn có thể sửa mã và duyệt.`
            : 'Sơ đồ được vẽ từ Use Case. Hãy mở tab "2. Tài liệu" và sinh tài liệu trước.'}
        </Empty>
      ) : (
        <div className="split-2">
          <div className="box">
            <div className="box-title">Mã Mermaid</div>
            <textarea value={code} onChange={(e) => setCode(e.target.value)} rows={24} spellCheck={false} aria-label="Mã Mermaid của sơ đồ" data-testid="diagram-code" />
            <span className="muted small">Actor là hình tròn (( )), Use Case là hình bầu dục ([ ]). Quan hệ: A -.-&gt;|"«include»"| B.</span>
          </div>
          <div className="box">
            <div className="box-title">Xem trước</div>
            {preview.trim() ? <Mermaid code={preview} name={`so-do-uc-${m.name}`} /> : <Empty title="Chưa có mã để vẽ" />}
          </div>
        </div>
      )}
    </div>
  );
}
