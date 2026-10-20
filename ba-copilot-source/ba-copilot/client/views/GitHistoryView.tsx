// Màn GitHub của dự án (#/p/:pid/git) – kế hoạch đợt 5, quyết định 10; mục 3 "C8". Chủ sở hữu: C8.
// Trên: trạng thái kết nối + nút "Cài đặt" (chỉ BA Lead, mở ProjectGitSettings trong Drawer).
// Dưới: commit của nhánh trên GitHub (link mở GitHub) + nhật ký các lần Duyệt đã đẩy (bảng git_pushes).

import React, { useEffect, useState } from "react";
import { get, getGitHistory, getProjectGit } from "../api.ts";
import type { GitHistory, GitPush, ProjectGit } from "../../shared/types.ts";
import { Badge, Btn, Empty, Icon, fmtTime, useUI } from "../components/ui.tsx";
import { useCurrentMember } from "../currentMember.ts";
import type { ProjectPageProps } from "../projectMenu.ts";
import { ProjectGitSettings } from "./ProjectGitSettings.tsx";

/** GitHistory + lỗi đọc commit từ GitHub (trường thêm của server, REQUESTS R-090). */
type History = GitHistory & { commitsError?: string };

const repoUrl = (repo: string) => {
  const s = repo.trim().replace(/\.git$/i, "").replace(/\/+$/, "");
  if (/^https?:\/\//i.test(s)) return s;
  if (/^git@github\.com:/i.test(s)) return `https://github.com/${s.replace(/^git@github\.com:/i, "")}`;
  return `https://github.com/${s.replace(/^(www\.)?github\.com\//i, "")}`;
};

/** "Duyệt: Tài liệu BRD – Module · BA … · duyệt bởi …" → "Tài liệu BRD". */
const productOf = (p: GitPush) => {
  const head = p.message.replace(/^Duyệt:\s*/, "").split(" · ")[0];
  const i = head.lastIndexOf(" – ");
  return i > 0 ? head.slice(0, i) : head;
};

function ExternalLink({ href, children, testId }: { href: string; children: React.ReactNode; testId?: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" data-testid={testId}>
      {children} <Icon name="external" size="xs" />
    </a>
  );
}

export function GitHistoryView({ projectId }: ProjectPageProps) {
  const { toast } = useUI();
  const { me, members } = useCurrentMember();
  const isLead = me?.role === "BA_LEAD";
  const [git, setGit] = useState<ProjectGit | null>(null);
  const [hist, setHist] = useState<History | null>(null);
  const [modules, setModules] = useState<{ id: string; name: string }[]>([]);
  const [settings, setSettings] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([getProjectGit(projectId), getGitHistory(projectId) as Promise<History>])
      .then(([g, h]) => (setGit(g), setHist(h)))
      .catch((e) => toast(e.message, "err"))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
    get(`/api/projects/${encodeURIComponent(projectId)}`)
      .then((p) => setModules((p.modules ?? []).map((m: { id: string; name: string }) => ({ id: m.id, name: m.name }))))
      .catch(() => undefined);
  }, [projectId]);

  const memberName = (id: string | null) => (id ? (members.find((m) => m.id === id)?.name ?? "Thành viên đã xoá") : "—");
  const moduleName = (id: string) => modules.find((m) => m.id === id)?.name ?? "—";

  if (!hist) return <div className="page muted">Đang tải…</div>;
  const configured = hist.configured;
  const hasRepo = !!git?.repo;

  return (
    <div className="page" data-testid="git-history">
      <div className="page-head">
        <div>
          <h1>Lịch sử GitHub</h1>
          <p className="muted">Mỗi lần BA Lead bấm Duyệt, đúng các tệp của sản phẩm đó được đưa lên GitHub thành một commit.</p>
        </div>
        <div className="toolbar">
          <Btn onClick={load} disabled={loading} data-testid="git-reload">
            <Icon name="reload" size="sm" /> Tải lại
          </Btn>
          {isLead && (
            <Btn kind="primary" onClick={() => setSettings(true)} data-testid="git-open-settings">
              <Icon name="settings" size="sm" /> Cài đặt
            </Btn>
          )}
        </div>
      </div>

      <section className="box" style={{ marginBottom: "var(--space-6)" }} data-testid="git-status">
        <div className="box-title">Kết nối</div>
        {configured ? (
          <div className="toolbar">
            <Badge tone="green">Đã cấu hình</Badge>
            <ExternalLink href={repoUrl(hist.repo)} testId="git-repo-link">
              {hist.repo}
            </ExternalLink>
            <span className="muted">
              · Nhánh <b>{hist.branch}</b>
            </span>
            {git?.updatedAt && <span className="muted small">· Cập nhật {fmtTime(git.updatedAt)}{git.updatedBy ? ` bởi ${memberName(git.updatedBy)}` : ""}</span>}
          </div>
        ) : (
          <div className="toolbar">
            <Badge tone="amber">Chưa cấu hình</Badge>
            <span className="muted">{hasRepo ? "Đã có link repo nhưng chưa có token." : "Chưa có repo GitHub cho dự án."} Duyệt vẫn được, nhưng chưa đẩy lên GitHub.</span>
          </div>
        )}
      </section>

      {!configured && !hist.pushes.length ? (
        <Empty title="Dự án chưa kết nối GitHub">
          {isLead
            ? 'Bấm "Cài đặt" ở góc phải, dán link repo của dự án và token GitHub (quyền ghi nội dung repo), chọn nhánh rồi bấm "Thử kết nối". Sau đó mỗi lần bạn Duyệt một sản phẩm, app sẽ tự đưa lên GitHub.'
            : 'Nhờ BA Lead của dự án vào màn này, bấm "Cài đặt" để dán link repo và token GitHub.'}
        </Empty>
      ) : (
        <>
          {configured && (
            <section style={{ marginBottom: "var(--space-6)" }}>
              <h2>
                Commit trên nhánh {hist.branch} <Badge>{hist.commits.length}</Badge>
              </h2>
              {hist.commitsError ? (
                <Empty title="Không đọc được lịch sử commit">{hist.commitsError}</Empty>
              ) : !hist.commits.length ? (
                <Empty title="Nhánh chưa có commit nào">Commit đầu tiên xuất hiện sau lần BA Lead Duyệt một sản phẩm.</Empty>
              ) : (
                <div className="table-wrap">
                  <table className="tbl" data-testid="git-commits">
                    <thead>
                      <tr>
                        <th>Nội dung</th>
                        <th>Người commit</th>
                        <th>Thời gian</th>
                        <th>Commit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hist.commits.map((c) => (
                        <tr key={c.sha}>
                          <td>{c.message.split("\n")[0]}</td>
                          <td className="nowrap">{c.author || "—"}</td>
                          <td className="muted small nowrap">{c.date ? fmtTime(c.date) : "—"}</td>
                          <td className="nowrap">
                            <ExternalLink href={c.url}>{c.sha.slice(0, 7)}</ExternalLink>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          <section>
            <h2>
              Nhật ký Duyệt → GitHub <Badge>{hist.pushes.length}</Badge>
            </h2>
            {!hist.pushes.length ? (
              <Empty title="Chưa có lần đẩy nào">Khi BA Lead Duyệt tài liệu, sơ đồ, prototype hoặc test case, mỗi lần đẩy được ghi lại ở đây.</Empty>
            ) : (
              <div className="table-wrap">
                <table className="tbl" data-testid="git-pushes">
                  <thead>
                    <tr>
                      <th>Sản phẩm</th>
                      <th>Module</th>
                      <th>Người duyệt</th>
                      <th>Thời gian</th>
                      <th>Nhánh</th>
                      <th>Commit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hist.pushes.map((p) => (
                      <tr key={p.id} title={p.files.join("\n")}>
                        <td>{productOf(p)}</td>
                        <td>{moduleName(p.artifact.moduleId)}</td>
                        <td className="nowrap">{memberName(p.byMemberId)}</td>
                        <td className="muted small nowrap">{fmtTime(p.createdAt)}</td>
                        <td className="nowrap">{p.branch}</td>
                        <td className="nowrap">{p.commitUrl ? <ExternalLink href={p.commitUrl}>{p.commitSha.slice(0, 7)}</ExternalLink> : p.commitSha.slice(0, 7)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {settings && <ProjectGitSettings projectId={projectId} onClose={() => setSettings(false)} onSaved={() => load()} />}
    </div>
  );
}
