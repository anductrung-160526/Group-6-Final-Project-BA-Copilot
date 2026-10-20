// Cài đặt GitHub của dự án – ngăn phải (kế hoạch đợt 5, quyết định 13, 14; mục 3 "C8"). Chủ sở hữu: C8.
// Chỉ BA Lead: dán link repo, token của dự án (lưu ở máy chủ, không bao giờ hiện lại), tên nhánh, nút "Thử kết nối".
// Dùng ở màn Lịch sử GitHub (GitHistoryView) và nút Cài đặt GitHub trên header dự án (C3).
//
//   <ProjectGitSettings projectId={pid} onClose={() => setOpen(false)} onSaved={(g) => …} />

import React, { useEffect, useState } from "react";
import { getProjectGit, saveProjectGit, testProjectGit } from "../api.ts";
import type { GitTestResult, ProjectGit, ProjectGitInput } from "../../shared/types.ts";
import { Badge, Btn, Drawer, Empty, Field, Icon, useUI } from "../components/ui.tsx";
import { useCurrentMember, withActor } from "../currentMember.ts";

export function ProjectGitSettings({ projectId, onClose, onSaved }: { projectId: string; onClose: () => void; onSaved?: (g: ProjectGit) => void }) {
  const { toast, confirm } = useUI();
  const { me } = useCurrentMember();
  const isLead = me?.role === "BA_LEAD";
  const [saved, setSaved] = useState<ProjectGit | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [repo, setRepo] = useState("");
  const [branch, setBranch] = useState("main");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState<"" | "save" | "test">("");
  const [result, setResult] = useState<GitTestResult | null>(null);

  useEffect(() => {
    getProjectGit(projectId)
      .then((g) => {
        setSaved(g);
        setRepo(g?.repo ?? "");
        setBranch(g?.branch || "main");
      })
      .catch((e) => toast(e.message, "err"))
      .finally(() => setLoaded(true));
  }, [projectId]);

  /** Ô token để trống → không gửi trường token (giữ token đã lưu). */
  const input = (): ProjectGitInput => ({ repo: repo.trim(), branch: branch.trim() || "main", ...(token.trim() ? { token: token.trim() } : {}) });

  const save = async (body: ProjectGitInput = input(), okText = "Đã lưu cài đặt GitHub") => {
    setBusy("save");
    try {
      const g = await saveProjectGit(projectId, withActor(body));
      setSaved(g);
      setToken("");
      toast(okText, "ok");
      onSaved?.(g);
      return g;
    } catch (e) {
      toast((e as Error).message, "err");
      return null;
    } finally {
      setBusy("");
    }
  };

  const test = async () => {
    setBusy("test");
    setResult(null);
    try {
      setResult(await testProjectGit(projectId, withActor(input())));
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy("");
    }
  };

  const clearToken = async () => {
    const ok = await confirm({
      title: "Xoá token GitHub của dự án?",
      message: "Sau khi xoá, bấm Duyệt sẽ không đẩy được lên GitHub cho tới khi dán token mới (trừ khi máy chủ có token mặc định).",
      okLabel: "Xoá token",
      danger: true,
    });
    if (ok) await save({ repo: repo.trim(), branch: branch.trim() || "main", token: "" }, "Đã xoá token");
  };

  const locked = !!busy || !loaded;

  return (
    <Drawer
      title="Cài đặt GitHub"
      onClose={onClose}
      testId="git-settings"
      footer={
        isLead ? (
          <>
            <Btn onClick={test} disabled={locked || !repo.trim()} data-testid="git-test">
              <Icon name="reload" size="sm" /> {busy === "test" ? "Đang thử…" : "Thử kết nối"}
            </Btn>
            <span className="spacer" />
            <Btn kind="ghost" onClick={onClose}>
              Huỷ
            </Btn>
            <Btn kind="primary" onClick={() => save().then((g) => g && onClose())} disabled={locked} data-testid="git-save">
              {busy === "save" ? "Đang lưu…" : "Lưu"}
            </Btn>
          </>
        ) : (
          <>
            <span className="spacer" />
            <Btn onClick={onClose}>Đóng</Btn>
          </>
        )
      }
    >
      {!isLead ? (
        <Empty title="Chỉ BA Lead được cài đặt GitHub">Chọn đúng người ở ô "Tôi là…" nếu bạn là BA Lead của dự án.</Empty>
      ) : !loaded ? (
        <p className="muted">Đang tải…</p>
      ) : (
        <>
          <p className="muted small">
            Khi BA Lead bấm <b>Duyệt</b> một sản phẩm, app tự đưa đúng các tệp của sản phẩm đó (tài liệu, sơ đồ, prototype, test case) lên một nhánh của repo này. Bấm "Xong" không đụng tới GitHub.
          </p>
          <Field label="Link repo GitHub" hint="Ví dụ: https://github.com/to-chuc/ten-repo">
            <input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="https://github.com/to-chuc/ten-repo" autoFocus data-testid="git-repo" />
          </Field>
          <Field
            label="Token GitHub của dự án"
            hint={
              saved?.hasToken
                ? "Đã lưu token – để trống ô này để giữ nguyên. Token chỉ lưu ở máy chủ, không hiện lại."
                : 'Fine-grained token có quyền "Contents: Read and write" trên repo này. Token chỉ lưu ở máy chủ, không hiện lại.'
            }
          >
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={saved?.hasToken ? "Đã lưu token" : "github_pat_…"}
              autoComplete="new-password"
              data-testid="git-token"
            />
          </Field>
          {saved?.hasToken && (
            <div className="toolbar">
              <Badge tone="green">
                <Icon name="lock" size="xs" /> Đã lưu token
              </Badge>
              <button type="button" className="link-danger" onClick={clearToken} disabled={!!busy} data-testid="git-clear-token">
                Xoá token
              </button>
            </div>
          )}
          <Field label="Nhánh nhận bản đã duyệt" hint='Mặc định "main". Nhánh chưa có thì app tự tạo từ nhánh mặc định của repo ở lần Duyệt đầu tiên.'>
            <input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="main" data-testid="git-branch" />
          </Field>
          {result && (
            <div className="box" data-testid="git-test-result">
              <Badge tone={result.ok ? "green" : "red"}>{result.ok ? "Kết nối được" : "Chưa kết nối được"}</Badge>
              <span>{result.message}</span>
              {result.defaultBranch && <span className="muted small">Nhánh mặc định của repo: {result.defaultBranch}</span>}
            </div>
          )}
        </>
      )}
    </Drawer>
  );
}
