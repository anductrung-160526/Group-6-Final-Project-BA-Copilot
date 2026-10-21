// Trang ẩn #/_gallery – hiển thị mọi token và component dùng chung để soát giao diện và chụp hồi quy (A11).
import React, { useState } from "react";
import {
  ApprovalBar,
  Avatar,
  Badge,
  Btn,
  ConflictNotice,
  Drawer,
  EditingBadge,
  Empty,
  Field,
  FileDrop,
  ICON_NAMES,
  Icon,
  IconBtn,
  IssueList,
  KanbanCard,
  KanbanColumn,
  MemberPicker,
  Modal,
  RevisionTag,
  RowActions,
  ScoreBadge,
  Select,
  SideNav,
  StatusBadge,
  SuggestionCard,
  Tabs,
  ToastItem,
  useUI,
  type ApprovalStatus,
  type BadgeTone,
  type IssueItem,
  type MemberOption,
  type SideNavItem,
} from "../components/ui.tsx";

const MINT = [
  ["mint-grad", "180°", "var(--color-mint-grad)"],
  ["mint-50", "#E6F8F6", "var(--color-mint-50)"],
  ["mint-200", "#5FE3DA", "var(--color-mint-200)"],
  ["mint-500", "#16A6AE", "var(--color-mint-500)"],
  ["mint-700", "#0F5A6E", "var(--color-mint-700)"],
  ["mint-900", "#0B2B39", "var(--color-mint-900)"],
];
const NEUTRAL = [
  ["strong", "#1C2A30", "var(--color-strong)"],
  ["body", "#3A4A52", "var(--color-body)"],
  ["muted", "#7C8B93", "var(--color-muted)"],
  ["border-strong", "#C9D5DB", "var(--color-border-strong)"],
  ["border", "#E3EAEC", "var(--color-border)"],
  ["bg-sub", "#F6FBFB", "var(--color-bg-sub)"],
];
const TONES: BadgeTone[] = ["gray", "blue", "mint", "green", "amber", "orange", "red", "violet", "flag"];
const MEMBERS: MemberOption[] = [
  { id: "m1", name: "Chi Hoang", role: "BA" },
  { id: "m2", name: "Lan Nguyen", role: "Dev" },
  { id: "m3", name: "Minh Tran", role: "QA" },
];
const ISSUES: IssueItem[] = [
  { severity: "warn", code: "AMBIGUOUS", message: 'Vague term: "fast"', suggestion: 'state a threshold, e.g. "≤ 2 seconds"' },
  { severity: "error", code: "WELL_FORMED", message: "Missing role" },
  { severity: "info", code: "MINIMAL", message: "Could be split into 2 stories" },
];

const NAV: SideNavItem[] = [
  { key: "stories", label: "Business Requirements", icon: "folder" },
  {
    key: "work",
    label: "Deliverables",
    icon: "grid",
    children: [
      { key: "docs", label: "Documents", step: 1, extra: <StatusBadge status="done" /> },
      { key: "diagrams", label: "Diagrams", step: 2, extra: <StatusBadge status="doing" /> },
      { key: "proto", label: "Prototype", step: 3 },
      { key: "tests", label: "Test case", step: 4 },
      { key: "trace", label: "Traceability", step: 5 },
    ],
  },
  { key: "tasks", label: "Task Board", icon: "check" },
  { key: "git", label: "GitHub History", icon: "github" },
  { key: "settings", label: "Project Settings", icon: "settings" },
];
const ROWS = [
  { id: "US-01", text: "As a customer, I want to sign in with my email", status: "approved" },
  { id: "US-02", text: "As a customer, I want to reset my password", status: "doing" },
];

function Swatch({ name, hex, color }: { name: string; hex: string; color: string }) {
  return (
    <div className="swatch">
      <div className="swatch-chip" style={{ background: color }} />
      <span>{name}</span>
      <span>{hex}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="gallery-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function Gallery() {
  const { toast, confirm } = useUI();
  const [tab, setTab] = useState<"a" | "b" | "c">("a");
  const [sel, setSel] = useState<"" | "draft" | "approved">("");
  const [member, setMember] = useState<string | null>("m1");
  const [modal, setModal] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [nav, setNav] = useState("modules");
  const [nav2, setNav2] = useState("diagrams");
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [mod, setMod] = useState<"" | "auth" | "order">("auth");
  const [appr, setAppr] = useState<ApprovalStatus>("draft");
  const [revision, setRevision] = useState(false);
  const [lead, setLead] = useState(true);
  const [cards, setCards] = useState<Record<string, string>>({ t1: "todo", t2: "todo", t3: "doing", t4: "done" });
  const cols = [
    ["todo", "To do"],
    ["doing", "In progress"],
    ["done", "Done"],
  ];

  return (
    <div className="page gallery" data-testid="gallery">
      <div>
        <div className="crumbs">Internal page · #/_gallery</div>
        <h1>Design System</h1>
        <p className="muted">All shared tokens and components. Usage rules: docs/design-system.md.</p>
      </div>

      <Section title="Colour palette">
        <div className="gallery-label">Mint (10% accent)</div>
        <div className="gallery-row">
          {MINT.map(([n, h, c]) => (
            <Swatch key={n} name={n} hex={h} color={c} />
          ))}
        </div>
        <div className="gallery-label">Neutral (60% background + 30% text, borders)</div>
        <div className="gallery-row">
          {NEUTRAL.map(([n, h, c]) => (
            <Swatch key={n} name={n} hex={h} color={c} />
          ))}
        </div>
      </Section>

      <Section title="Typography">
        <div className="paper">
          <div className="type-row">
            <span className="muted small">H1 · 30 · Space Grotesk</span>
            <h1>Dashboard BA Copilot</h1>
          </div>
          <div className="type-row">
            <span className="muted small">H2 · 20 · Space Grotesk</span>
            <h2>Module list</h2>
          </div>
          <div className="type-row">
            <span className="muted small">H3 · 16/600 · Space Grotesk</span>
            <h3>Business Requirements</h3>
          </div>
          <div className="type-row">
            <span className="muted small">body · 14 · Inter</span>
            <span>Generate screens, specifications and test cases from requirements.</span>
          </div>
          <div className="type-row">
            <span className="muted small">small · 12.5 · Inter</span>
            <span className="small muted">Secondary labels, captions, table column headers.</span>
          </div>
        </div>
      </Section>

      <Section title="Badge (hugs its text)">
        <div className="gallery-row">
          {TONES.map((t) => (
            <Badge key={t} tone={t}>
              {t === "flag" ? "! risk_flag" : t}
            </Badge>
          ))}
        </div>
        <div className="gallery-row">
          {["none", "draft", "done", "approved", "outdated", "open", "sent", "resolved"].map((s) => (
            <StatusBadge key={s} status={s} />
          ))}
        </div>
        <div className="gallery-label">Task status + tags</div>
        <div className="gallery-row">
          {["todo", "doing", "done", "approved"].map((s) => (
            <StatusBadge key={s} status={s} />
          ))}
          <RevisionTag />
          <RevisionTag compact testId="revision-tag-compact" />
          <EditingBadge names={["Lan Nguyen"]} testId="editing-badge-1" />
          <EditingBadge names={["Lan Nguyen", "Minh Tran", "Chi Hoang", "Ha Le"]} testId="editing-badge-4" />
        </div>
        <div className="gallery-label">Long text in a narrow container (badge-text → "…", full text in the tooltip)</div>
        <div className="gallery-row" style={{ maxWidth: 200 }}>
          <Badge title="API Spec document – Product Management">
            <Icon name="doc" size="xs" />
            <span className="badge-text">API Spec document – Product Management</span>
          </Badge>
        </div>
        <div className="gallery-row">
          <ScoreBadge score={92} />
          <ScoreBadge score={78} />
          <ScoreBadge score={55} />
          <ScoreBadge score={100} showLabel={false} />
        </div>
      </Section>

      <Section title="Icon (Lucide)">
        <div className="muted small">
          Use {'<Icon name="edit" />'} with the names below; colour follows the parent's text colour. Sizes: xs 12 · sm 14 · md 16 (default) · lg 20.
        </div>
        <div className="icon-grid">
          {ICON_NAMES.map((n) => (
            <span key={n} className="icon-cell">
              <Icon name={n} />
              {n}
            </span>
          ))}
        </div>
        <div className="gallery-row">
          <Btn kind="primary">
            <Icon name="plus" />
            Add user story
          </Btn>
          <Btn>
            <Icon name="ai" />
            Generate with AI
          </Btn>
          <Btn>
            <Icon name="regenerate" />
            Regenerate
          </Btn>
          <Btn kind="ghost">
            <Icon name="external" />
            Open GitHub
          </Btn>
          <IconBtn icon="more" label="More actions" />
          <IconBtn icon="close" label="Close" size="lg" />
          <IconBtn icon="delete" label="Delete" tone="danger" disabled />
        </div>
      </Section>

      <Section title="Edit / Delete (RowActions)">
        <div className="muted small">In tables: icons in the last column (variant="icons"). In drawers: text buttons (variant="buttons"). Delete always asks for confirmation.</div>
        <table className="tbl">
          <thead>
            <tr>
              <th>ID</th>
              <th>User story</th>
              <th>Status</th>
              <th className="actions" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.id} className="clickable" onClick={() => toast(`Open ${r.id}`)}>
                <td>{r.id}</td>
                <td>{r.text}</td>
                <td>
                  <StatusBadge status={r.status} />
                </td>
                <td className="actions">
                  <RowActions
                    testId={`row-${r.id}`}
                    onEdit={() => toast(`Edit ${r.id}`)}
                    onDelete={() => toast(`Deleted ${r.id}`, "ok")}
                    deleteConfirm={{ title: `Delete ${r.id}?`, message: "The story and its acceptance criteria will be deleted." }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="gallery-row">
          <RowActions variant="buttons" onEdit={() => toast("Edit")} onDelete={() => toast("Deleted", "ok")} testId="row-buttons" />
        </div>
      </Section>

      <div className="gallery-cols">
        <Section title="SideNav (multi-level left menu, collapses to an icon rail)">
          <div className={`gallery-panel ${navCollapsed ? "gallery-panel-rail" : ""}`}>
            <div className="project-nav-bar">
              <IconBtn
                icon={navCollapsed ? "navExpand" : "navCollapse"}
                label={navCollapsed ? "Expand menu" : "Collapse menu"}
                aria-expanded={!navCollapsed}
                onClick={() => setNavCollapsed((v) => !v)}
                data-testid="gallery-sidenav-toggle"
              />
            </div>
            <SideNav
              items={NAV}
              active={nav2}
              onSelect={setNav2}
              collapsed={navCollapsed}
              testId="gallery-sidenav"
              header={
                <Select
                  value={mod}
                  placeholder="Select module"
                  options={[
                    { value: "auth", label: "Module: Authentication" },
                    { value: "order", label: "Module: Ordering" },
                  ]}
                  onChange={setMod}
                />
              }
            />
          </div>
        </Section>

        <Section title="ApprovalBar (Mark as done / Approve / Request changes)">
          <div className="gallery-row">
            <Select
              value={appr}
              options={(["none", "draft", "done", "approved", "outdated", "todo", "doing"] as ApprovalStatus[]).map((s) => ({ value: s, label: s }))}
              onChange={(v) => setAppr((v || "none") as ApprovalStatus)}
            />
            <label className="check-inline">
              <input type="checkbox" checked={lead} onChange={(e) => setLead(e.target.checked)} />
              BA Lead
            </label>
            <label className="check-inline">
              <input type="checkbox" checked={revision} onChange={(e) => setRevision(e.target.checked)} />
              Changes requested
            </label>
          </div>
          <ApprovalBar
            status={appr}
            revisionRequested={revision}
            isLead={lead}
            onStart={() => setAppr("doing")}
            onDone={() => setAppr("done")}
            onApprove={() => {
              setAppr("approved");
              setRevision(false);
            }}
            onRequestChange={() => {
              setAppr("draft");
              setRevision(true);
            }}
          />
          <div className="gallery-label">Task without a linked artifact (todo → Start work; doing → Mark as done; BA Lead can Request changes even when Approved)</div>
          <ApprovalBar status="todo" isLead={lead} onStart={() => toast("Moved to In progress", "ok")} testId="approval-bar-task" />
          <ApprovalBar status="approved" isLead reopenApproved onRequestChange={() => toast("Changes requested", "ok")} testId="approval-bar-task-approved" />
          <div className="gallery-label">Locked (disabledReason)</div>
          <ApprovalBar status="draft" isLead={false} onDone={() => {}} disabledReason="The Documents step is not Done yet" testId="approval-bar-locked" />
          <div className="gallery-label">Conflict notice (409)</div>
          <ConflictNotice onReload={() => toast("Latest version loaded", "ok")} />
        </Section>
      </div>

      <div className="gallery-cols">
        <Section title="Buttons">
          <div className="gallery-row">
            <Btn kind="primary">+ Add new</Btn>
            <Btn>Secondary</Btn>
            <Btn kind="ghost">Ghost</Btn>
            <button className="link">Link</button>
            <Btn kind="danger">Danger</Btn>
            <Btn kind="primary" disabled>
              Disabled
            </Btn>
          </div>
          <div className="gallery-row">
            <Btn size="sm" kind="primary">
              + New
            </Btn>
            <Btn size="sm">Small</Btn>
            <Btn size="sm" kind="ghost">
              Skip
            </Btn>
          </div>
        </Section>

        <Section title="Form / Tab">
          <Field label="Module name" hint="Required, up to 80 characters">
            <input placeholder="Enter a name…" />
          </Field>
          <Field label="Status">
            <Select
              value={sel}
              placeholder="Select status"
              options={[
                { value: "draft", label: "Draft" },
                { value: "approved", label: "Approved" },
              ]}
              onChange={setSel}
            />
          </Field>
          <Field label="Assignee">
            <MemberPicker members={MEMBERS} value={member} onChange={setMember} />
          </Field>
          <Tabs
            active={tab}
            onChange={setTab}
            items={[
              { key: "a", label: "Selected" },
              { key: "b", label: "Documents", extra: <StatusBadge status="draft" /> },
              { key: "c", label: "Test case" },
            ]}
          />
          <div className="gallery-label">Tabs variant="pill" (top bar menu)</div>
          <Tabs
            variant="pill"
            active={tab}
            onChange={setTab}
            items={[
              { key: "a", label: "Task Board" },
              { key: "b", label: "Document Repository" },
              { key: "c", label: "Members" },
            ]}
          />
        </Section>
      </div>

      <div className="gallery-cols">
        <Section title="Left menu">
          <div className="doc-nav side-nav" style={{ width: 240 }}>
            {[
              ["modules", "Module"],
              ["files", "Document Repository"],
              ["tasks", "Task Board"],
              ["members", "Members"],
            ].map(([k, l]) => (
              <button key={k} className={`side-nav-item ${nav === k ? "active" : ""}`} onClick={() => setNav(k)}>
                {l}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Table">
          <table className="tbl">
            <thead>
              <tr>
                <th>ID</th>
                <th>Screen</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr className="clickable selected">
                <td>SCR-09</td>
                <td>Project details</td>
                <td>
                  <StatusBadge status="approved" />
                </td>
              </tr>
              <tr className="clickable">
                <td>SCR-10</td>
                <td>Design Studio</td>
                <td>
                  <StatusBadge status="draft" />
                </td>
              </tr>
            </tbody>
          </table>
          <div className="muted small">Selected / hover row: mint-50 background, mint-500 left border.</div>
        </Section>
      </div>

      <Section title="Dialogs, drawers, toasts">
        <div className="gallery-row">
          <Btn onClick={() => setModal(true)}>Open Modal</Btn>
          <Btn onClick={() => setDrawer(true)}>Open Drawer</Btn>
          <Btn
            kind="danger"
            onClick={async () => toast((await confirm({ title: "Delete module \"Authentication\"?", message: "The module's screens, documents and test cases will be deleted.", okLabel: "Delete", danger: true })) ? "Deleted" : "Cancelled")}
          >
            Confirm dialog
          </Btn>
          <Btn onClick={() => toast("Changes saved", "ok")}>Success toast</Btn>
          <Btn onClick={() => toast("Could not save – try again", "err")}>Error toast</Btn>
        </div>
        <div className="gallery-row">
          <ToastItem kind="info">Regular notice</ToastItem>
          <ToastItem kind="ok">Changes saved</ToastItem>
          <ToastItem kind="err">Could not save</ToastItem>
        </div>
      </Section>

      <div className="gallery-cols">
        <Section title="File upload">
          <FileDrop onFiles={(f) => toast(`Selected ${f.length} ${f.length === 1 ? "file" : "files"}`, "info")} />
        </Section>
        <Section title="Empty state">
          <Empty title="No modules yet">Click "+ New module" to get started.</Empty>
        </Section>
      </div>

      <Section title="Kanban (drag cards between columns)">
        <div className="kanban">
          {cols.map(([cid, label]) => {
            const ids = Object.keys(cards).filter((k) => cards[k] === cid);
            return (
              <KanbanColumn key={cid} id={cid} title={label} count={ids.length} onDropCard={(card, col) => setCards((c) => ({ ...c, [card]: col }))}>
                {ids.map((k) => (
                  <KanbanCard
                    key={k}
                    id={k}
                    title={`Task ${k.toUpperCase()} – write the SRS for the sign-in screen`}
                    meta={
                      <>
                        <Badge tone="blue">SRS</Badge>
                        <Avatar name="Lan Nguyen" size="sm" />
                        <span>20/10</span>
                      </>
                    }
                  />
                ))}
              </KanbanColumn>
            );
          })}
        </div>
      </Section>

      <div className="gallery-cols">
        <Section title="IssueList (QUS)">
          <IssueList issues={ISSUES} />
          <IssueList issues={[]} empty="Meets the QUS criteria" />
        </Section>
        <Section title="SuggestionCard (SCR-16)">
          <SuggestionCard title="Forgot password" reason='The "Forgot password?" button on the Sign in screen has no target' onAccept={() => toast("Create screen", "ok")} onDismiss={() => toast("Dismissed")} />
          <SuggestionCard title="Order history" reason="FR-04 is not covered by any screen yet" onAccept={() => {}} onDismiss={() => {}} />
        </Section>
      </div>

      <Section title="2-column layout (.split-2)">
        <div className="split-2">
          <div className="box">
            <div className="box-title">Mermaid code</div>
            <div className="muted small">Left column: edit</div>
          </div>
          <div className="box">
            <div className="box-title">Preview</div>
            <div className="muted small">Right column: result</div>
          </div>
        </div>
      </Section>

      {modal && (
        <Modal
          title="Create module"
          onClose={() => setModal(false)}
          footer={
            <>
              <Btn onClick={() => setModal(false)}>Cancel</Btn>
              <Btn kind="primary" onClick={() => setModal(false)}>
                Create
              </Btn>
            </>
          }
        >
          <Field label="Module name">
            <input autoFocus />
          </Field>
        </Modal>
      )}
      {drawer && (
        <Drawer
          title="sign-in-specification.docx"
          onClose={() => setDrawer(false)}
          testId="gallery-drawer"
          actions={<Btn size="sm">Download</Btn>}
          footer={
            <>
              <RowActions variant="buttons" onEdit={() => toast("Edit")} onDelete={() => setDrawer(false)} deleteConfirm={{ title: "Delete this file?", message: "This cannot be undone." }} testId="drawer-actions" />
              <span className="spacer" />
              <Btn onClick={() => setDrawer(false)}>Close</Btn>
            </>
          }
        >
          <div className="box">
            <div className="box-title">Source</div>
            <div>Exported from the Authentication module · 10/20/2026</div>
          </div>
          <Empty title="No preview available" />
        </Drawer>
      )}
    </div>
  );
}
