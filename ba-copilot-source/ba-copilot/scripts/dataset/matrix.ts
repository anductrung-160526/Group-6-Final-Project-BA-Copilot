// Ma trận phủ cho bộ dữ liệu "bổ sung UI": phân bổ 670 màn gốc theo nhóm màn × loại màn × miền nghiệp vụ ×
// quyền người dùng × kiểu bố cục, cân bằng và lặp lại được (seed cố định). 200 màn × ~50 mẫu ≈ 10 nghìn mẫu.
// 50 màn đầu (cân bằng 10/nhóm) là đợt thử; thêm màn không làm đổi các màn trước (vòng xoay độc lập với tổng số).
// 50 màn được đổi sang 25 loại màn web mới (nhóm workspace, data) qua dataset/matrix-overrides.json.
// Mở rộng (phương án C): thêm 100 màn R201–R300 thuộc 25 loại màn web hướng người dùng cuối (thương mại, nội dung,
// đặt chỗ, trang giới thiệu), miền và bố cục khác 200 màn đầu – buildExtension(), không đổi 200 màn cũ.
// Mở rộng 2: thêm 100 màn R301–R400 thuộc 25 loại màn mà các component hiếm (Checkbox, Radio, DatePicker, Textarea, Image,
// Alert, Divider, Pagination, Avatar) xuất hiện tự nhiên theo nghiệp vụ – buildExtension2(); không đổi 300 màn trước.
// Mở rộng 3: thêm 400 màn R401–R800 xoay vòng qua mọi loại màn của ba bộ trước (thí nghiệm đường cong học, STRICT-NEXT.md)
// – buildExtension3(); không đổi 400 màn trước.
// Dùng: npx tsx scripts/dataset/matrix.ts → dataset/matrix.json
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { rng } from "../build-next-model.ts";

export const GROUPS: Record<string, string[]> = {
  auth: ["Đăng nhập", "Đăng ký tài khoản", "Quên mật khẩu", "Đặt lại mật khẩu", "Xác thực OTP", "Đổi mật khẩu", "Hồ sơ cá nhân", "Cài đặt tài khoản"],
  list: ["Danh sách có tìm kiếm, lọc, phân trang", "Báo cáo dạng bảng", "Kết quả tra cứu", "Tổng quan (chỉ số + bảng)"],
  form: ["Tạo mới", "Chỉnh sửa", "Xem chi tiết", "Biểu mẫu nhiều phần", "Bước trong quy trình nhiều bước"],
  approval: ["Hàng chờ phê duyệt", "Chi tiết hồ sơ cần duyệt", "Màn theo vai trò (người tạo / người duyệt)"],
  state: ["Danh sách rỗng", "Thông báo lỗi", "Hộp thoại xác nhận", "Thông báo thành công", "Không có quyền truy cập"],
};
export const DOMAINS = ["Bán hàng (sản phẩm, đơn hàng)", "Khách hàng (CRM)", "Nhân sự", "Nghỉ phép & chấm công", "Kho hàng", "Tài chính & hóa đơn", "Dự án & công việc", "Đào tạo & khóa học", "Y tế & lịch hẹn", "Bất động sản & hợp đồng thuê", "Hỗ trợ khách hàng (ticket)", "Quản trị hệ thống & người dùng"];
export const PERMISSIONS = ["Toàn quyền (xem, thêm, sửa, xóa)", "Chỉ xem", "Chỉ được tạo mới, không sửa/xóa", "Chỉ được duyệt/từ chối", "Chỉ thao tác trên bản ghi của chính mình"];
export const LAYOUTS = ["Trang đơn", "Sidebar điều hướng + nội dung", "Thẻ (Card) ở giữa", "Hộp thoại (Modal) trên trang", "Hai cột", "Thanh tiêu đề có nút + nội dung"];

export const EXT_GROUPS: Record<string, string[]> = {
  commerce: ["Chi tiết sản phẩm", "Danh mục sản phẩm (lưới + bộ lọc)", "Thanh toán nhiều bước", "Theo dõi đơn hàng", "Danh sách yêu thích", "Trang khuyến mãi", "Đánh giá sản phẩm"],
  marketing: ["Trang đích giới thiệu sản phẩm", "Giới thiệu công ty", "Trang liên hệ", "Đăng ký nhận bản tin", "Danh sách việc làm", "Chi tiết tin tuyển dụng và ứng tuyển"],
  content: ["Danh sách bài viết / blog", "Chi tiết bài viết và bình luận", "Trang sự kiện và đăng ký tham dự", "Trang khóa học công khai"],
  service: ["Đặt lịch hẹn trực tuyến", "Đặt phòng / đặt chỗ", "Trang cửa hàng / người bán", "Tài khoản của tôi (người dùng cuối)", "Trang trạng thái hệ thống", "Trang 404 / bảo trì", "Màn chào mừng và hướng dẫn bắt đầu", "Hồ sơ công khai"],
};
export const EXT_DOMAINS = ["Thời trang", "Điện tử & điện máy", "Du lịch & khách sạn", "Nhà hàng & giao đồ ăn", "Giáo dục trực tuyến", "Phòng khám & sức khỏe", "Phần mềm SaaS", "Sự kiện & bán vé", "Ngân hàng & ví điện tử", "Thể thao & phòng tập", "Báo chí & xuất bản", "Nội thất & nhà cửa"];
export const EXT_PERMISSIONS = ["Khách vãng lai (chưa đăng nhập)", "Khách hàng đã đăng nhập", "Quản trị nội dung (sửa trang công khai)"];
export const EXT_LAYOUTS = ["Thanh điều hướng trên + nội dung + chân trang", "Lưới thẻ", "Hai cột", "Trang đơn", "Banner lớn + các khối nội dung", "Sidebar điều hướng + nội dung"];

export const EXT2_GROUPS: Record<string, string[]> = {
  richform: ["Khảo sát nhiều câu hỏi", "Đơn đăng ký dịch vụ có điều khoản", "Đặt chỗ có ngày đi và ngày về", "Hồ sơ ứng tuyển", "Cài đặt thông báo (danh sách tùy chọn)", "Bộ lọc nâng cao (khoảng ngày, nhiều lựa chọn)", "Phiếu đánh giá có thang điểm", "Biểu mẫu khiếu nại / góp ý"],
  media: ["Thư viện ảnh / album", "Bài viết có ảnh minh họa", "Giới thiệu đội ngũ (ảnh, avatar)", "Hồ sơ địa điểm có ảnh"],
  feedback: ["Màn lỗi có cảnh báo và hướng khắc phục", "Màn thành công có tóm tắt", "Cảnh báo hệ thống / bảo trì", "Xác nhận trước khi gửi"],
  records: ["Bảng dữ liệu nhiều trang", "Lịch sử giao dịch (lọc ngày, phân trang)", "Danh bạ thành viên có phân trang", "Báo cáo theo khoảng ngày"],
  preferences: ["Cài đặt quyền riêng tư", "Tùy chọn hiển thị", "Đăng ký nhận tin theo chủ đề", "Cấu hình lịch làm việc", "Thiết lập thanh toán định kỳ"],
};

export interface Assignment {
  id: string;
  batch: "pilot" | "main" | "ext" | "ext2" | "ext3";
  group: string;
  screenKind: string;
  domain: string;
  permission: string;
  layout: string;
}

export function buildMatrix(total = 200, pilot = 50, seed = 20261018): Assignment[] {
  const r = rng(seed);
  const groups = Object.keys(GROUPS);
  const out: Assignment[] = [];
  // xoay vòng có xáo trộn để mỗi thuộc tính phủ đều
  const cyc = <T,>(arr: T[]) => {
    let pool: T[] = [];
    return () => {
      if (!pool.length) pool = [...arr].sort(() => r() - 0.5);
      return pool.pop()!;
    };
  };
  const nextDomain = cyc(DOMAINS), nextLayout = cyc(LAYOUTS), nextPerm = cyc(PERMISSIONS);
  const kindCyc = Object.fromEntries(groups.map((g) => [g, cyc(GROUPS[g])]));
  for (let i = 0; i < total; i++) {
    const group = groups[i % groups.length];
    let permission = nextPerm();
    if (group === "auth") permission = "Người dùng thao tác trên tài khoản của chính mình";
    if (group === "approval" && /Toàn quyền|Chỉ được tạo/.test(permission)) permission = "Chỉ được duyệt/từ chối";
    let layout = nextLayout();
    out.push({ id: `R${String(i + 1).padStart(3, "0")}`, batch: i < pilot ? "pilot" : "main", group, screenKind: kindCyc[group](), domain: nextDomain(), permission, layout });
  }
  return out;
}

/** 100 màn mở rộng R201–R300 (25 loại × 4), xoay vòng miền/quyền/bố cục với seed riêng. */
export function buildExtension(total = 100, start = 201, seed = 20261118): Assignment[] {
  const r = rng(seed);
  const cyc = <T,>(arr: T[]) => {
    let pool: T[] = [];
    return () => {
      if (!pool.length) pool = [...arr].sort(() => r() - 0.5);
      return pool.pop()!;
    };
  };
  const kinds = Object.entries(EXT_GROUPS).flatMap(([g, ks]) => ks.map((k) => [g, k] as const));
  const nextDomain = cyc(EXT_DOMAINS), nextLayout = cyc(EXT_LAYOUTS), nextPerm = cyc(EXT_PERMISSIONS);
  return Array.from({ length: total }, (_, i) => {
    const [group, screenKind] = kinds[i % kinds.length];
    return { id: `R${start + i}`, batch: "ext" as const, group, screenKind, domain: nextDomain(), permission: nextPerm(), layout: nextLayout() };
  });
}

/** 100 màn mở rộng 2 R301–R400: loại màn giàu component hiếm; miền, quyền, bố cục lấy từ cả hai bộ trước. */
export function buildExtension2(total = 100, start = 301, seed = 20261218): Assignment[] {
  const r = rng(seed);
  const cyc = <T,>(arr: T[]) => {
    let pool: T[] = [];
    return () => {
      if (!pool.length) pool = [...arr].sort(() => r() - 0.5);
      return pool.pop()!;
    };
  };
  const kinds = Object.entries(EXT2_GROUPS).flatMap(([g, ks]) => ks.map((k) => [g, k] as const));
  const nextDomain = cyc([...DOMAINS, ...EXT_DOMAINS]), nextLayout = cyc([...new Set([...LAYOUTS, ...EXT_LAYOUTS])]), nextPerm = cyc([...PERMISSIONS, ...EXT_PERMISSIONS]);
  return Array.from({ length: total }, (_, i) => {
    const [group, screenKind] = kinds[i % kinds.length];
    return { id: `R${start + i}`, batch: "ext2" as const, group, screenKind, domain: nextDomain(), permission: nextPerm(), layout: nextLayout() };
  });
}

/** 400 màn mở rộng 3 R401–R800: mọi loại màn của ba bộ trước, miền/quyền/bố cục gộp, seed riêng. */
export function buildExtension3(total = 400, start = 401, seed = 20261319): Assignment[] {
  const r = rng(seed);
  const cyc = <T,>(arr: T[]) => {
    let pool: T[] = [];
    return () => {
      if (!pool.length) pool = [...arr].sort(() => r() - 0.5);
      return pool.pop()!;
    };
  };
  const kinds = [GROUPS, EXT_GROUPS, EXT2_GROUPS].flatMap((G) => Object.entries(G).flatMap(([g, ks]) => ks.map((k) => [g, k] as const)));
  const nextKind = cyc(kinds), nextDomain = cyc([...DOMAINS, ...EXT_DOMAINS]), nextLayout = cyc([...new Set([...LAYOUTS, ...EXT_LAYOUTS])]);
  const nextPerm = cyc(PERMISSIONS), nextExtPerm = cyc(EXT_PERMISSIONS);
  return Array.from({ length: total }, (_, i) => {
    const [group, screenKind] = nextKind();
    let permission = group in GROUPS ? nextPerm() : nextExtPerm();
    if (group === "auth") permission = "Người dùng thao tác trên tài khoản của chính mình";
    if (group === "approval" && /Toàn quyền|Chỉ được tạo/.test(permission)) permission = "Chỉ được duyệt/từ chối";
    return { id: `R${start + i}`, batch: "ext3" as const, group, screenKind, domain: nextDomain(), permission, layout: nextLayout() };
  });
}

/** Thay loại màn của một số màn gốc (dataset/matrix-overrides.json) để đa dạng hơn mà không xáo trộn các màn còn lại. */
export function applyOverrides(m: Assignment[], file = join(import.meta.dirname, "..", "..", "dataset", "matrix-overrides.json")): Assignment[] {
  if (!existsSync(file)) return m;
  const ov = JSON.parse(readFileSync(file, "utf8")) as Record<string, Partial<Assignment>>;
  return m.map((a) => (ov[a.id] ? { ...a, ...ov[a.id] } : a));
}

if (process.argv[1]?.endsWith("matrix.ts")) {
  const m = [...applyOverrides(buildMatrix()), ...buildExtension(), ...buildExtension2(), ...buildExtension3()];
  writeFileSync(join(import.meta.dirname, "..", "..", "dataset", "matrix.json"), JSON.stringify(m, null, 1));
  const count = (k: keyof Assignment) => Object.entries(m.reduce((a, x) => ((a[x[k]] = (a[x[k]] ?? 0) + 1), a), {} as Record<string, number>));
  console.log(`${m.length} màn gốc (${m.filter((x) => x.batch === "pilot").length} đợt thử)`);
  for (const k of ["group", "domain", "permission", "layout"] as const) console.log(k, count(k).map(([a, b]) => `${a}: ${b}`).join(" · "));
}
