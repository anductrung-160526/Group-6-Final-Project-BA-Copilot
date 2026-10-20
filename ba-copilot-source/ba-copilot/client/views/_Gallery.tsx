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
  { id: "m1", name: "Hoàng Văn Chí", role: "BA" },
  { id: "m2", name: "Nguyễn Thị Lan", role: "Dev" },
  { id: "m3", name: "Trần Minh", role: "QA" },
];
const ISSUES: IssueItem[] = [
  { severity: "warn", code: "AMBIGUOUS", message: 'Từ mơ hồ: "nhanh"', suggestion: 'nêu ngưỡng, ví dụ "≤ 2 giây"' },
  { severity: "error", code: "WELL_FORMED", message: "Thiếu vai trò" },
  { severity: "info", code: "MINIMAL", message: "Có thể tách thành 2 story" },
];

const NAV: SideNavItem[] = [
  { key: "stories", label: "Yêu cầu nghiệp vụ", icon: "folder" },
  {
    key: "work",
    label: "Thực hiện công việc",
    icon: "grid",
    children: [
      { key: "docs", label: "Tài liệu", step: 1, extra: <StatusBadge status="done" /> },
      { key: "diagrams", label: "Sơ đồ", step: 2, extra: <StatusBadge status="doing" /> },
      { key: "proto", label: "Prototype", step: 3 },
      { key: "tests", label: "Test case", step: 4 },
      { key: "trace", label: "Truy vết", step: 5 },
    ],
  },
  { key: "tasks", label: "Công việc", icon: "check" },
  { key: "git", label: "Lịch sử GitHub", icon: "github" },
  { key: "settings", label: "Cài đặt dự án", icon: "settings" },
];
const ROWS = [
  { id: "US-01", text: "Là khách hàng, tôi muốn đăng nhập bằng email", status: "approved" },
  { id: "US-02", text: "Là khách hàng, tôi muốn đặt lại mật khẩu", status: "doing" },
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
  const [mod, setMod] = useState<"" | "auth" | "order">("auth");
  const [appr, setAppr] = useState<ApprovalStatus>("draft");
  const [revision, setRevision] = useState(false);
  const [lead, setLead] = useState(true);
  const [cards, setCards] = useState<Record<string, string>>({ t1: "todo", t2: "todo", t3: "doing", t4: "done" });
  const cols = [
    ["todo", "Cần làm"],
    ["doing", "Đang làm"],
    ["done", "Xong"],
  ];

  return (
    <div className="page gallery" data-testid="gallery">
      <div>
        <div className="crumbs">Trang nội bộ · #/_gallery</div>
        <h1>Design System</h1>
        <p className="muted">Mọi token và component dùng chung. Quy tắc dùng: docs/design-system.md.</p>
      </div>

      <Section title="Bảng màu">
        <div className="gallery-label">Mint (điểm nhấn 10%)</div>
        <div className="gallery-row">
          {MINT.map(([n, h, c]) => (
            <Swatch key={n} name={n} hex={h} color={c} />
          ))}
        </div>
        <div className="gallery-label">Trung tính (60% nền + 30% chữ, viền)</div>
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
            <h2>Danh sách module</h2>
          </div>
          <div className="type-row">
            <span className="muted small">H3 · 16/600 · Space Grotesk</span>
            <h3>Yêu cầu nghiệp vụ</h3>
          </div>
          <div className="type-row">
            <span className="muted small">body · 14 · Inter</span>
            <span>Sinh màn hình, tài liệu đặc tả và test case từ yêu cầu.</span>
          </div>
          <div className="type-row">
            <span className="muted small">small · 12.5 · Inter</span>
            <span className="small muted">Nhãn phụ, chú thích, tiêu đề cột bảng.</span>
          </div>
        </div>
      </Section>

      <Section title="Badge (ôm sát chữ)">
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
        <div className="gallery-label">Trạng thái công việc + tag</div>
        <div className="gallery-row">
          {["todo", "doing", "done", "approved"].map((s) => (
            <StatusBadge key={s} status={s} />
          ))}
          <RevisionTag />
          <EditingBadge names={["Nguyễn Thị Lan"]} testId="editing-badge-1" />
          <EditingBadge names={["Nguyễn Thị Lan", "Trần Minh", "Hoàng Văn Chí", "Lê Hà"]} testId="editing-badge-4" />
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
          Gọi <code>{'<Icon name="edit" />'}</code> theo tên dưới đây; màu theo chữ của phần tử cha. Cỡ: xs 12 · sm 14 · md 16 (mặc định) · lg 20.
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
            Thêm user story
          </Btn>
          <Btn>
            <Icon name="ai" />
            Sinh bằng AI
          </Btn>
          <Btn kind="ghost">
            <Icon name="external" />
            Mở GitHub
          </Btn>
          <IconBtn icon="more" label="Thêm thao tác" />
          <IconBtn icon="close" label="Đóng" size="lg" />
          <IconBtn icon="delete" label="Xoá" tone="danger" disabled />
        </div>
      </Section>

      <Section title="Sửa / Xoá (RowActions)">
        <div className="muted small">Trong bảng: icon ở cột cuối (`variant="icons"`). Trong ngăn phải: nút chữ (`variant="buttons"`). Xoá luôn hỏi xác nhận.</div>
        <table className="tbl">
          <thead>
            <tr>
              <th>Mã</th>
              <th>User story</th>
              <th>Trạng thái</th>
              <th className="actions" aria-label="Thao tác" />
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.id} className="clickable" onClick={() => toast(`Mở ${r.id}`)}>
                <td>{r.id}</td>
                <td>{r.text}</td>
                <td>
                  <StatusBadge status={r.status} />
                </td>
                <td className="actions">
                  <RowActions
                    testId={`row-${r.id}`}
                    onEdit={() => toast(`Sửa ${r.id}`)}
                    onDelete={() => toast(`Đã xoá ${r.id}`, "ok")}
                    deleteConfirm={{ title: `Xoá ${r.id}?`, message: "Story và tiêu chí chấp nhận sẽ bị xoá." }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="gallery-row">
          <RowActions variant="buttons" onEdit={() => toast("Sửa")} onDelete={() => toast("Đã xoá", "ok")} testId="row-buttons" />
        </div>
      </Section>

      <div className="gallery-cols">
        <Section title="SideNav (menu trái nhiều cấp)">
          <div className="gallery-panel">
            <SideNav
              items={NAV}
              active={nav2}
              onSelect={setNav2}
              testId="gallery-sidenav"
              header={
                <Select
                  value={mod}
                  placeholder="Chọn module"
                  options={[
                    { value: "auth", label: "Module: Xác thực" },
                    { value: "order", label: "Module: Đặt hàng" },
                  ]}
                  onChange={setMod}
                />
              }
            />
          </div>
        </Section>

        <Section title="ApprovalBar (Xong / Duyệt / Yêu cầu sửa)">
          <div className="gallery-row">
            <Select
              value={appr}
              options={(["none", "draft", "done", "approved", "outdated"] as ApprovalStatus[]).map((s) => ({ value: s, label: s }))}
              onChange={(v) => setAppr((v || "none") as ApprovalStatus)}
            />
            <label className="check-inline">
              <input type="checkbox" checked={lead} onChange={(e) => setLead(e.target.checked)} />
              BA Lead
            </label>
            <label className="check-inline">
              <input type="checkbox" checked={revision} onChange={(e) => setRevision(e.target.checked)} />
              Yêu cầu sửa
            </label>
          </div>
          <ApprovalBar
            status={appr}
            revisionRequested={revision}
            isLead={lead}
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
          <div className="gallery-label">Bị khoá (disabledReason)</div>
          <ApprovalBar status="draft" isLead={false} onDone={() => {}} disabledReason="Bước Tài liệu chưa Xong" testId="approval-bar-locked" />
          <div className="gallery-label">Báo xung đột (409)</div>
          <ConflictNotice onReload={() => toast("Đã tải bản mới", "ok")} />
        </Section>
      </div>

      <div className="gallery-cols">
        <Section title="Nút">
          <div className="gallery-row">
            <Btn kind="primary">+ Thêm mới</Btn>
            <Btn>Secondary</Btn>
            <Btn kind="ghost">Ghost</Btn>
            <button className="link">Liên kết</button>
            <Btn kind="danger">Nguy hiểm</Btn>
            <Btn kind="primary" disabled>
              Disabled
            </Btn>
          </div>
          <div className="gallery-row">
            <Btn size="sm" kind="primary">
              + Mới
            </Btn>
            <Btn size="sm">Nhỏ</Btn>
            <Btn size="sm" kind="ghost">
              Bỏ qua
            </Btn>
          </div>
        </Section>

        <Section title="Form / Tab">
          <Field label="Tên module" hint="Bắt buộc, tối đa 80 ký tự">
            <input placeholder="Nhập tên…" />
          </Field>
          <Field label="Trạng thái">
            <Select
              value={sel}
              placeholder="Chọn trạng thái"
              options={[
                { value: "draft", label: "Bản nháp" },
                { value: "approved", label: "Đã duyệt" },
              ]}
              onChange={setSel}
            />
          </Field>
          <Field label="Người phụ trách">
            <MemberPicker members={MEMBERS} value={member} onChange={setMember} />
          </Field>
          <Tabs
            active={tab}
            onChange={setTab}
            items={[
              { key: "a", label: "Đang chọn" },
              { key: "b", label: "Tài liệu", extra: <StatusBadge status="draft" /> },
              { key: "c", label: "Test case" },
            ]}
          />
          <div className="gallery-label">Tabs variant="pill" (menu thanh trên)</div>
          <Tabs
            variant="pill"
            active={tab}
            onChange={setTab}
            items={[
              { key: "a", label: "Công việc" },
              { key: "b", label: "Kho tài liệu" },
              { key: "c", label: "Thành viên" },
            ]}
          />
        </Section>
      </div>

      <div className="gallery-cols">
        <Section title="Menu trái">
          <div className="doc-nav side-nav" style={{ width: 240 }}>
            {[
              ["modules", "Module"],
              ["files", "Kho tài liệu"],
              ["tasks", "Công việc"],
              ["members", "Thành viên"],
            ].map(([k, l]) => (
              <button key={k} className={`side-nav-item ${nav === k ? "active" : ""}`} onClick={() => setNav(k)}>
                {l}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Bảng">
          <table className="tbl">
            <thead>
              <tr>
                <th>Mã</th>
                <th>Màn hình</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              <tr className="clickable selected">
                <td>SCR-09</td>
                <td>Chi tiết dự án</td>
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
          <div className="muted small">Hàng chọn / hover: nền mint-50, viền trái mint-500.</div>
        </Section>
      </div>

      <Section title="Hộp thoại, ngăn phải, thông báo">
        <div className="gallery-row">
          <Btn onClick={() => setModal(true)}>Mở Modal</Btn>
          <Btn onClick={() => setDrawer(true)}>Mở Drawer</Btn>
          <Btn
            kind="danger"
            onClick={async () => toast((await confirm({ title: "Xoá module \"Xác thực\"?", message: "Màn hình, tài liệu và test case của module sẽ bị xoá.", okLabel: "Xoá", danger: true })) ? "Đã xoá" : "Đã huỷ")}
          >
            Hỏi xác nhận
          </Btn>
          <Btn onClick={() => toast("Đã lưu thay đổi", "ok")}>Toast thành công</Btn>
          <Btn onClick={() => toast("Không lưu được – thử lại", "err")}>Toast lỗi</Btn>
        </div>
        <div className="gallery-row">
          <ToastItem kind="info">Thông báo thường</ToastItem>
          <ToastItem kind="ok">Đã lưu thay đổi</ToastItem>
          <ToastItem kind="err">Không lưu được</ToastItem>
        </div>
      </Section>

      <div className="gallery-cols">
        <Section title="Tải tệp">
          <FileDrop onFiles={(f) => toast(`Đã chọn ${f.length} tệp`, "info")} />
        </Section>
        <Section title="Trạng thái rỗng">
          <Empty title="Chưa có module nào">Bấm "+ Module mới" để bắt đầu.</Empty>
        </Section>
      </div>

      <Section title="Kanban (kéo thả thẻ giữa các cột)">
        <div className="kanban">
          {cols.map(([cid, label]) => {
            const ids = Object.keys(cards).filter((k) => cards[k] === cid);
            return (
              <KanbanColumn key={cid} id={cid} title={label} count={ids.length} onDropCard={(card, col) => setCards((c) => ({ ...c, [card]: col }))}>
                {ids.map((k) => (
                  <KanbanCard
                    key={k}
                    id={k}
                    title={`Task ${k.toUpperCase()} – viết SRS màn đăng nhập`}
                    meta={
                      <>
                        <Badge tone="blue">SRS</Badge>
                        <Avatar name="Nguyễn Thị Lan" size="sm" />
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
          <IssueList issues={[]} empty="✓ Đạt chuẩn QUS" />
        </Section>
        <Section title="SuggestionCard (SCR-16)">
          <SuggestionCard title="Quên mật khẩu" reason='Nút "Quên mật khẩu?" ở màn Đăng nhập chưa có đích' onAccept={() => toast("Tạo màn", "ok")} onDismiss={() => toast("Đã bỏ qua")} />
          <SuggestionCard title="Lịch sử đơn hàng" reason="FR-04 chưa có màn nào phủ" onAccept={() => {}} onDismiss={() => {}} />
        </Section>
      </div>

      <Section title="Bố cục 2 cột (.split-2)">
        <div className="split-2">
          <div className="box">
            <div className="box-title">Mã Mermaid</div>
            <div className="muted small">Cột trái: soạn</div>
          </div>
          <div className="box">
            <div className="box-title">Xem trước</div>
            <div className="muted small">Cột phải: xem kết quả</div>
          </div>
        </div>
      </Section>

      {modal && (
        <Modal
          title="Tạo module"
          onClose={() => setModal(false)}
          footer={
            <>
              <Btn onClick={() => setModal(false)}>Huỷ</Btn>
              <Btn kind="primary" onClick={() => setModal(false)}>
                Tạo
              </Btn>
            </>
          }
        >
          <Field label="Tên module">
            <input autoFocus />
          </Field>
        </Modal>
      )}
      {drawer && (
        <Drawer
          title="dac-ta-dang-nhap.docx"
          onClose={() => setDrawer(false)}
          testId="gallery-drawer"
          actions={<Btn size="sm">Tải về</Btn>}
          footer={
            <>
              <RowActions variant="buttons" onEdit={() => toast("Sửa")} onDelete={() => setDrawer(false)} deleteConfirm={{ title: "Xoá tệp này?", message: "Không khôi phục được." }} testId="drawer-actions" />
              <span className="spacer" />
              <Btn onClick={() => setDrawer(false)}>Đóng</Btn>
            </>
          }
        >
          <div className="box">
            <div className="box-title">Nguồn</div>
            <div>Xuất từ module Xác thực · 20/10/2026</div>
          </div>
          <Empty title="Chưa có bản xem trước" />
        </Drawer>
      )}
    </div>
  );
}
