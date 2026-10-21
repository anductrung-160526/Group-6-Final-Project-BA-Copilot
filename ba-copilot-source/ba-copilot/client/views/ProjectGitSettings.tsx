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

  const save = async (body: ProjectGitInput = input(), okText = "GitHub settings saved") => {
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
      title: "Delete the project's GitHub token?",
      message: "After deletion, approving will not push to GitHub until a new token is pasted (unless the server has a default token).",
      okLabel: "Delete token",
      danger: true,
    });
    if (ok) await save({ repo: repo.trim(), branch: branch.trim() || "main", token: "" }, "Token deleted");
  };

  const locked = !!busy || !loaded;

  return (
    <Drawer
      title="GitHub Settings"
      onClose={onClose}
      testId="git-settings"
      footer={
        isLead ? (
          <>
            <Btn onClick={test} disabled={locked || !repo.trim()} data-testid="git-test">
              <Icon name="reload" size="sm" /> {busy === "test" ? "Testing…" : "Test connection"}
            </Btn>
            <span className="spacer" />
            <Btn kind="ghost" onClick={onClose}>
              Cancel
            </Btn>
            <Btn kind="primary" onClick={() => save().then((g) => g && onClose())} disabled={locked} data-testid="git-save">
              {busy === "save" ? "Saving…" : "Save"}
            </Btn>
          </>
        ) : (
          <>
            <span className="spacer" />
            <Btn onClick={onClose}>Close</Btn>
          </>
        )
      }
    >
      {!isLead ? (
        <Empty title="Only a BA Lead can configure GitHub">Select yourself in the "Acting as" box if you are the project's BA Lead.</Empty>
      ) : !loaded ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <p className="muted small">
            When a BA Lead clicks <b>Approve</b> on an artifact, the app pushes exactly that artifact's files (document, diagram, prototype, test cases) to a branch of this repository. "Mark as done" does not touch GitHub.
          </p>
          <Field label="GitHub repository link" hint="Example: https://github.com/organization/repo-name">
            <input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="https://github.com/to-chuc/ten-repo" autoFocus data-testid="git-repo" />
          </Field>
          <Field
            label="Project GitHub token"
            hint={
              saved?.hasToken
                ? "A token is saved – leave this field empty to keep it. The token is stored only on the server and is never shown again."
                : 'A fine-grained token with the "Contents: Read and write" permission on this repository. The token is stored only on the server and is never shown again.'
            }
          >
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={saved?.hasToken ? "Token saved" : "github_pat_…"}
              autoComplete="new-password"
              data-testid="git-token"
            />
          </Field>
          {saved?.hasToken && (
            <div className="toolbar">
              <Badge tone="green">
                <Icon name="lock" size="xs" /> Token saved
              </Badge>
              <Btn size="sm" kind="danger" onClick={clearToken} disabled={!!busy} data-testid="git-clear-token">
                <Icon name="delete" size="sm" />
                Delete token
              </Btn>
            </div>
          )}
          <Field label="Branch for approved artifacts" hint={`Default "main". If the branch does not exist, the app creates it from the repository's default branch on the first approval.`}>
            <input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="main" data-testid="git-branch" />
          </Field>
          {result && (
            <div className="box" data-testid="git-test-result">
              <Badge tone={result.ok ? "green" : "red"}>{result.ok ? "Connected" : "Not connected"}</Badge>
              <span>{result.message}</span>
              {result.defaultBranch && <span className="muted small">Repository default branch: {result.defaultBranch}</span>}
            </div>
          )}
        </>
      )}
    </Drawer>
  );
}
