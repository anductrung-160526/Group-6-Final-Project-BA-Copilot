import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  splitStories,
  scoreStories,
  storyScore,
  qusRating,
  RATING_LABEL,
  BASE_SCORE,
  PENALTY_ERROR,
  PENALTY_WARN,
  PENALTY_INFO,
  type QusIssue,
} from "../shared/qus.ts";
import { openDb } from "../server/db.ts";
import { createApp } from "../server/app.ts";
import { saveModuleQus } from "../server/routes/qus.ts";

const has = (res: ReturnType<typeof scoreStories>, idx: number, code: string) => res.stories[idx].issues.some((i) => i.code === code);

const FIXTURE_MAIN = `- As a Khách hàng, I want đăng nhập bằng email và mật khẩu, so that tôi mua hàng nhanh hơn.
- As a Khách hàng, I want đăng ký tài khoản mới.
- Cho phép quản trị viên quản lý sản phẩm (tìm kiếm, thêm, sửa, xóa).`;

test("Fixture chính 3 dòng: phát hiện đúng AMBIGUOUS, NO_END, WELL_FORMED", () => {
  const res = scoreStories(FIXTURE_MAIN);
  assert.equal(res.stories.length, 3);

  // Dòng 1: có AMBIGUOUS ("nhanh"), không có ATOMIC (vì email và mật khẩu là danh từ)
  const s1 = res.stories[0];
  assert.ok(s1.issues.some((i) => i.code === "AMBIGUOUS" && i.message.includes("nhanh")), "dòng 1 phải có AMBIGUOUS('nhanh')");
  assert.ok(!s1.issues.some((i) => i.code === "NO_END"), "dòng 1 có so that nên không được có NO_END");
  assert.ok(!s1.issues.some((i) => i.code === "WELL_FORMED"), "dòng 1 chuẩn mẫu");

  // Dòng 2: có NO_END
  const s2 = res.stories[1];
  assert.ok(s2.issues.some((i) => i.code === "NO_END"), "dòng 2 phải có NO_END");
  assert.ok(!s2.issues.some((i) => i.code === "WELL_FORMED"), "dòng 2 chuẩn mẫu");

  // Dòng 3: thiếu role/means template -> WELL_FORMED
  const s3 = res.stories[2];
  assert.ok(s3.issues.some((i) => i.code === "WELL_FORMED"), "dòng 3 phải có WELL_FORMED");

  // Khuôn mẫu đa số là "As a…" (2/3) -> chỉ dòng 3 (viết tự do) bị NOT_UNIFORM
  assert.ok(!has(res, 0, "NOT_UNIFORM") && !has(res, 1, "NOT_UNIFORM"));
  assert.ok(has(res, 2, "NOT_UNIFORM"), "dòng 3 lệch khuôn mẫu đa số");
});

test("Tiêu chí WELL_FORMED: đúng mẫu và sai mẫu", () => {
  // Đúng mẫu English
  const okEn = scoreStories("As a user, I want to reset password so that I can regain access.");
  assert.ok(!okEn.stories[0].issues.some((i) => i.code === "WELL_FORMED"));

  // Đúng mẫu Tiếng Việt
  const okVi = scoreStories("Là một Khách hàng, tôi muốn xem lịch sử đơn hàng để theo dõi giao hàng.");
  assert.ok(!okVi.stories[0].issues.some((i) => i.code === "WELL_FORMED"));

  // Đúng biến thể 'Với tư cách là'
  const okVariant = scoreStories("Với tư cách là Quản trị viên, tôi muốn khóa tài khoản gian lận để bảo vệ hệ thống.");
  assert.ok(!okVariant.stories[0].issues.some((i) => i.code === "WELL_FORMED"));

  // Sai: câu tự do không có role và means
  const bad1 = scoreStories("Cần hệ thống thanh toán qua ví điện tử.");
  assert.ok(bad1.stories[0].issues.some((i) => i.code === "WELL_FORMED"));

  // Sai: thiếu means
  const bad2 = scoreStories("As a customer, I want so that I can buy.");
  assert.ok(bad2.stories[0].issues.some((i) => i.code === "WELL_FORMED"));
});

test("Tiêu chí NO_END: có end và thiếu end", () => {
  const withEnd = scoreStories("As a Buyer, I want to checkout so that my order is placed.");
  assert.ok(!withEnd.stories[0].issues.some((i) => i.code === "NO_END"));

  const withoutEnd = scoreStories("As a Buyer, I want to checkout.");
  assert.ok(withoutEnd.stories[0].issues.some((i) => i.code === "NO_END"));
});

test("Tiêu chí ATOMIC: một hành động vs nhiều hành động", () => {
  // Một hành động: chỉ đăng nhập (dù có danh từ nối bằng và)
  const single = scoreStories("As a user, I want đăng nhập bằng email và số điện thoại so that tôi vào hệ thống.");
  assert.ok(!single.stories[0].issues.some((i) => i.code === "ATOMIC"));

  // Nhiều hành động nối bằng và + động từ
  const multiAndVi = scoreStories("Là một Admin, tôi muốn xem danh sách và xóa người dùng để dọn dẹp hệ thống.");
  assert.ok(multiAndVi.stories[0].issues.some((i) => i.code === "ATOMIC"));

  // Nhiều hành động nối bằng dấu chấm phẩy ;
  const multiSemi = scoreStories("As an admin, I want to create user; assign roles so that setup is complete.");
  assert.ok(multiSemi.stories[0].issues.some((i) => i.code === "ATOMIC"));
});

test("Tiêu chí MINIMAL: gọn gàng vs có ghi chú thừa/ví dụ/lưu ý", () => {
  const clean = scoreStories("As an author, I want to publish articles so that readers can view them.");
  assert.ok(!clean.stories[0].issues.some((i) => i.code === "MINIMAL"));

  // Chứa 'lưu ý'
  const withNote = scoreStories("As an author, I want to publish articles (lưu ý: kiểm tra chính tả trước khi đăng) so that readers can view them.");
  assert.ok(withNote.stories[0].issues.some((i) => i.code === "MINIMAL"));

  // Chứa 'ví dụ'
  const withExample = scoreStories("As a user, I want to filter products ví dụ theo giá hoặc màu để chọn nhanh hơn.");
  assert.ok(withExample.stories[0].issues.some((i) => i.code === "MINIMAL"));

  // Chứa 'e.g.'
  const withEg = scoreStories("As a user, I want to export data e.g. CSV to review.");
  assert.ok(withEg.stories[0].issues.some((i) => i.code === "MINIMAL"));
});

test("Tiêu chí AMBIGUOUS: từ ngữ rõ ràng vs từ ngữ mơ hồ", () => {
  const clear = scoreStories("As a user, I want to receive confirmation SMS within 30 seconds so that I can verify.");
  assert.ok(!clear.stories[0].issues.some((i) => i.code === "AMBIGUOUS"));

  for (const w of ["nhanh", "dễ dàng", "thân thiện", "tốt", "hiệu quả", "linh hoạt", "tối ưu", "etc", "v.v", "fast", "easy", "user-friendly"]) {
    const res = scoreStories(`As a user, I want to have a ${w} interface so that I am happy.`);
    assert.ok(res.stories[0].issues.some((i) => i.code === "AMBIGUOUS"), `từ mơ hồ '${w}' phải bị bắt`);
  }
});

test("Tiêu chí FULL_SENTENCE: câu đủ dài vs câu dưới 4 từ", () => {
  const longEnough = scoreStories("As a user I want login so that I can buy");
  assert.ok(!longEnough.stories[0].issues.some((i) => i.code === "FULL_SENTENCE"));

  const tooShort = scoreStories("As a user");
  assert.ok(tooShort.stories[0].issues.some((i) => i.code === "FULL_SENTENCE"));
});

test("Tiêu chí DUPLICATE (G1): khác biệt, trùng trong module, dưới ngưỡng 0,8, trùng chéo module", () => {
  // Khác biệt
  const diffRes = scoreStories(`- As a reader, I want to bookmark articles so that I can read later.
- As an admin, I want to manage billing plans so that subscriptions work.`);
  assert.ok(!has(diffRes, 0, "DUPLICATE") && !has(diffRes, 1, "DUPLICATE"));

  // Trùng: chỉ story đứng sau bị đánh dấu
  const dupRes = scoreStories(`- As a reader, I want to bookmark articles so that I can read them later.
- As a reader, I want to bookmark articles so that I can read later.`);
  assert.ok(!has(dupRes, 0, "DUPLICATE"));
  assert.ok(has(dupRes, 1, "DUPLICATE"));
  assert.ok(dupRes.stories[1].issues.find((i) => i.code === "DUPLICATE")!.message.includes("#1"));

  // Giống phần khung nhưng khác nội dung: dưới ngưỡng 0,8 nên không trùng
  const near = scoreStories(`- Là khách hàng, tôi muốn đăng nhập để mua hàng.
- Là khách hàng, tôi muốn đăng ký để mua hàng.`);
  assert.ok(!has(near, 1, "DUPLICATE"));

  // Trùng với story của module khác cùng dự án
  const cross = scoreStories("Là khách hàng, tôi muốn xem lịch sử đơn hàng để theo dõi giao hàng.", {
    others: [{ moduleName: "Đơn hàng", text: "- Là khách hàng, tôi muốn xem lịch sử đơn hàng để theo dõi giao hàng." }],
  });
  const crossIssue = cross.stories[0].issues.find((i) => i.code === "DUPLICATE");
  assert.ok(crossIssue && crossIssue.message.includes("Đơn hàng"));
  assert.equal(cross.stories[0].score, BASE_SCORE - PENALTY_WARN);
});

test("Tiêu chí NOT_UNIFORM (G2): theo khuôn mẫu đa số, bỏ qua khi chỉ có 1 story", () => {
  const uniform = scoreStories(`- As a user, I want to login so that I get in.
- As a user, I want to logout so that I exit.`);
  assert.ok(!has(uniform, 0, "NOT_UNIFORM") && !has(uniform, 1, "NOT_UNIFORM"));

  // Đa số tiếng Việt, 1 story tiếng Anh -> story tiếng Anh lệch
  const majVi = scoreStories(`- Là khách, tôi muốn tìm sản phẩm để xem giá.
- Là khách, tôi muốn thêm sản phẩm vào giỏ để mua sau.
- As a guest, I want to checkout so that I pay.`);
  assert.ok(!has(majVi, 0, "NOT_UNIFORM") && !has(majVi, 1, "NOT_UNIFORM"));
  assert.ok(has(majVi, 2, "NOT_UNIFORM"));
  assert.equal(majVi.stories[2].issues.find((i) => i.code === "NOT_UNIFORM")!.severity, "info");

  // Hoà 1–1 giữa khuôn mẫu chuẩn và viết tự do -> story tự do lệch
  const mixed = scoreStories(`- As a user, I want to login so that I get in.
- Cho phép người dùng xuất hóa đơn PDF.`);
  assert.ok(!has(mixed, 0, "NOT_UNIFORM"));
  assert.ok(has(mixed, 1, "NOT_UNIFORM"));

  // Chỉ 1 story -> bỏ qua tiêu chí
  const single = scoreStories("Cho phép người dùng xuất hóa đơn PDF ra máy.");
  assert.ok(!has(single, 0, "NOT_UNIFORM"));
});

test("Công thức điểm (G4) và xếp hạng Tốt/Khá/Cần sửa", () => {
  // 1 error (WELL_FORMED) -> 70
  const oneErr = scoreStories("Cần hệ thống thanh toán qua ví điện tử.");
  assert.equal(oneErr.stories[0].score, BASE_SCORE - PENALTY_ERROR);

  // 1 warn (NO_END) + 1 info (MINIMAL) -> 80
  const warnInfo = scoreStories("As a user, I want to export data e.g. CSV files.");
  assert.ok(has(warnInfo, 0, "NO_END") && has(warnInfo, 0, "MINIMAL"));
  assert.equal(warnInfo.stories[0].score, BASE_SCORE - PENALTY_WARN - PENALTY_INFO);

  // Điểm module = trung bình cộng, làm tròn
  const avg = scoreStories(`- As a user, I want to login so that I get in.
- As a user, I want to logout.`);
  assert.equal(avg.total, Math.round((100 + 85) / 2));

  assert.equal(qusRating(100), "good");
  assert.equal(qusRating(80), "good");
  assert.equal(qusRating(79), "fair");
  assert.equal(qusRating(60), "fair");
  assert.equal(qusRating(59), "poor");
  assert.equal(RATING_LABEL[qusRating(59)], "Cần sửa");
});

test("Các trường hợp biên: chuỗi rỗng, khoảng trắng, 1 story, đánh số, tiếng Việt có dấu, hoa thường", () => {
  // Rỗng và khoảng trắng
  const emptyRes = scoreStories("");
  assert.deepEqual(emptyRes.stories, []);
  assert.equal(emptyRes.total, 0);

  const spaceRes = scoreStories("   \n\t  \n   ");
  assert.deepEqual(spaceRes.stories, []);
  assert.equal(spaceRes.total, 0);

  // 1 story
  const oneRes = scoreStories("As a member, I want to view profile so that I can verify info.");
  assert.equal(oneRes.stories.length, 1);
  assert.equal(oneRes.total, 100);
  assert.equal(oneRes.stories[0].score, 100);

  // Danh sách đánh số 1. 2. và 1) 2)
  const numDots = `1. As a user, I want to login so that I access dashboard.
2. As a user, I want to logout so that I protect account.`;
  assert.equal(splitStories(numDots).length, 2);

  const numParens = `1) Là một khách, tôi muốn tìm sản phẩm để xem giá.
2) Là một khách, tôi muốn thêm vào giỏ để chuẩn bị mua.`;
  assert.equal(splitStories(numParens).length, 2);

  // Hoa thường lẫn lộn
  const mixedCase = scoreStories("aS A User, I WANT to see orders SO THAT I know status.");
  assert.ok(!mixedCase.stories[0].issues.some((i) => i.code === "WELL_FORMED"));
  assert.ok(!mixedCase.stories[0].issues.some((i) => i.code === "NO_END"));

  // Tiếng Việt có dấu NFC
  const viRes = scoreStories("Là một Người dùng, tôi muốn cập nhật ảnh đại diện để bạn bè nhận ra.");
  assert.equal(viRes.stories.length, 1);
  assert.ok(!viRes.stories[0].issues.some((i) => i.code === "WELL_FORMED"));
});

test("Điểm số luôn trong dải [0, 100] và hàm thuần không có tác dụng phụ", () => {
  // Điểm bị trừ nhiều lỗi vẫn không âm (< 0)
  const terrible = scoreStories("x"); // < 4 từ (-15), WELL_FORMED (-30), rỗng means (-30), ...
  assert.ok(terrible.stories[0].score >= 0 && terrible.stories[0].score <= 100);
  assert.ok(terrible.total >= 0 && terrible.total <= 100);

  // Hàm thuần: gọi 2 lần ra cùng kết quả
  const run1 = scoreStories(FIXTURE_MAIN);
  const run2 = scoreStories(FIXTURE_MAIN);
  assert.deepEqual(run1, run2);
});

// ---------------------------------------------------------------- Bổ sung A8 (mục 3.4 tài liệu v2)

const issue = (severity: QusIssue["severity"]): QusIssue => ({ code: "X", severity, message: "" });

test("Công thức điểm (G4): trừ đúng từng mức và chặn đáy 0", () => {
  assert.equal(storyScore([]), BASE_SCORE);
  assert.equal(storyScore([issue("error")]), 70);
  assert.equal(storyScore([issue("warn")]), 85);
  assert.equal(storyScore([issue("info")]), 95);
  assert.equal(storyScore([issue("error"), issue("warn"), issue("info")]), 50);
  // 3 lỗi + 1 cảnh báo = −105 → chặn ở 0, không âm
  assert.equal(storyScore([issue("error"), issue("error"), issue("error"), issue("warn")]), 0);
  assert.equal(storyScore(Array.from({ length: 10 }, () => issue("error"))), 0);
});

test("5 story mẫu: điểm khớp với tính tay", () => {
  const text = `- Là khách hàng, tôi muốn xem lịch sử đơn hàng để theo dõi giao hàng.
- Tôi muốn đăng nhập nhanh
- Là quản trị viên, tôi muốn xem danh sách và xóa người dùng để dọn dẹp hệ thống.
- Là khách hàng, tôi muốn đặt hàng.
- As a guest, I want to export invoices (lưu ý: chỉ định dạng PDF) so that I can keep records.`;
  const res = scoreStories(text);
  const codes = res.stories.map((s) => s.issues.map((i) => i.code).sort());
  // Khuôn mẫu đa số: "Là…" (3 story) → story #2 (tự do) và #5 ("As a…") nhận NOT_UNIFORM.
  // #1: chuẩn, đủ mục đích                         → 100
  // #2: WELL_FORMED (−30), AMBIGUOUS "nhanh" (−15), NOT_UNIFORM (−5) → 50
  // #3: ATOMIC "và xóa" (−15)                       → 85
  // #4: NO_END (−15)                                → 85
  // #5: MINIMAL "lưu ý" (−5), NOT_UNIFORM (−5)      → 90
  // Điểm module = (100 + 50 + 85 + 85 + 90) / 5 = 82 → Tốt
  assert.deepEqual(codes, [[], ["AMBIGUOUS", "NOT_UNIFORM", "WELL_FORMED"], ["ATOMIC"], ["NO_END"], ["MINIMAL", "NOT_UNIFORM"]]);
  assert.deepEqual(
    res.stories.map((s) => s.score),
    [100, 50, 85, 85, 90],
  );
  assert.equal(res.total, 82);
  assert.equal(RATING_LABEL[qusRating(res.total)], "Tốt");
});

test("FN-55: lỗi chỉ ra đoạn chữ gây lỗi và gợi ý viết lại", () => {
  const amb = scoreStories("Là khách hàng, tôi muốn thanh toán dễ dùng để mua hàng.").stories[0].issues.find((i) => i.code === "AMBIGUOUS")!;
  assert.equal(amb.excerpt, "dễ dùng");
  assert.match(amb.message, /"dễ dùng"/);
  assert.ok(amb.suggestion && amb.suggestion.length > 0);

  const atomic = scoreStories("Là Admin, tôi muốn xem danh sách và xóa người dùng để dọn dẹp.").stories[0].issues.find((i) => i.code === "ATOMIC")!;
  assert.equal(atomic.excerpt, "và xóa");
  assert.match(atomic.message, /"và xóa"/);

  const minimal = scoreStories("Là tác giả, tôi muốn đăng bài (lưu ý: kiểm tra chính tả) để độc giả đọc.").stories[0].issues.find((i) => i.code === "MINIMAL")!;
  assert.equal(minimal.excerpt, "lưu ý");

  // Mọi lỗi đều có gợi ý sửa
  for (const s of scoreStories(FIXTURE_MAIN).stories) for (const i of s.issues) assert.ok(i.suggestion, `${i.code} thiếu gợi ý`);
});

test("Tiếng Việt: vi phạm từng tiêu chí với story viết bằng tiếng Việt", () => {
  assert.ok(has(scoreStories("Hệ thống cần có chức năng thanh toán."), 0, "WELL_FORMED"));
  assert.ok(has(scoreStories("Là thủ kho, tôi muốn nhập kho."), 0, "NO_END"));
  assert.ok(has(scoreStories("Là thủ kho, tôi muốn nhập kho đồng thời xuất kho để quản lý tồn."), 0, "ATOMIC"));
  assert.ok(has(scoreStories("Là thủ kho, tôi muốn lọc phiếu ví dụ theo ngày để tra cứu."), 0, "MINIMAL"));
  assert.ok(has(scoreStories("Là thủ kho, tôi muốn tìm phiếu nhanh chóng để tiết kiệm thời gian."), 0, "AMBIGUOUS"));
  assert.ok(has(scoreStories("Nhập kho"), 0, "FULL_SENTENCE"));
  const dup = scoreStories(`- Là thủ kho, tôi muốn in phiếu nhập để lưu hồ sơ.
- Là thủ kho, tôi muốn in phiếu nhập để lưu hồ sơ giấy.`);
  assert.ok(has(dup, 1, "DUPLICATE"));
  // Chữ tiếng Việt dạng tổ hợp (NFD) vẫn được nhận ra như dạng dựng sẵn (NFC)
  const nfd = scoreStories("Là khách hàng, tôi muốn xem đơn hàng để theo dõi.".normalize("NFD"));
  assert.ok(!has(nfd, 0, "WELL_FORMED") && !has(nfd, 0, "NO_END"));
});

test("FN-50: mỗi câu bắt đầu bằng 'As a' hay 'Là' là một story, kể cả khi viết liền một dòng", () => {
  assert.equal(splitStories("Là khách, tôi muốn tìm sản phẩm để xem giá. Là khách, tôi muốn thanh toán để nhận hàng.").length, 2);
  assert.equal(splitStories("As a user, I want to login so that I get in. As an admin, I want to ban users so that spam stops.").length, 2);
  // "as a" viết thường giữa câu không bị tách nhầm
  assert.equal(splitStories("As a user, I want to export data e.g. as a CSV file so that I can review.").length, 1);
  // Câu tiếp theo không bắt đầu bằng khuôn mẫu thì vẫn thuộc story trước
  assert.equal(splitStories("Là khách, tôi muốn thanh toán để nhận hàng. Hỗ trợ thẻ nội địa.").length, 1);
});

test("NOT_UNIFORM (G2): khuôn mẫu đa số chỉ xét 'As a…' và 'Là…'", () => {
  // 2 story tự do + 1 story "Là…": khuôn mẫu đa số là "Là…", story đúng mẫu không bị phạt
  const res = scoreStories(`- Cho phép quản trị viên khoá tài khoản người dùng.
- Hệ thống gửi email xác nhận đơn hàng.
- Là khách hàng, tôi muốn xem đơn hàng để theo dõi.`);
  assert.ok(has(res, 0, "NOT_UNIFORM") && has(res, 1, "NOT_UNIFORM"));
  assert.ok(!has(res, 2, "NOT_UNIFORM"));
  assert.equal(res.stories[2].score, 100);

  // Không story nào theo khuôn mẫu chuẩn → bỏ qua tiêu chí
  const allFree = scoreStories(`- Cho phép quản trị viên khoá tài khoản người dùng.
- Hệ thống gửi email xác nhận đơn hàng.`);
  assert.ok(!has(allFree, 0, "NOT_UNIFORM") && !has(allFree, 1, "NOT_UNIFORM"));

  // Hoà "As a…" và "Là…" → lấy khuôn mẫu xuất hiện trước
  const tie = scoreStories(`- As a user, I want to login so that I get in.
- Là khách, tôi muốn đăng xuất để bảo vệ tài khoản.`);
  assert.ok(!has(tie, 0, "NOT_UNIFORM") && has(tie, 1, "NOT_UNIFORM"));
});

test("DUPLICATE (G1): chỉ so trong cùng module khi không truyền module khác", () => {
  const text = "Là khách hàng, tôi muốn xem lịch sử đơn hàng để theo dõi giao hàng.";
  assert.ok(!has(scoreStories(text), 0, "DUPLICATE"));
  assert.ok(!has(scoreStories(text, { others: [] }), 0, "DUPLICATE"));
});

// ---------------------------------------------------------------- API (FN-56, BR-05)

let server: Server;
let base = "";
async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(base + path, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: (await res.json()) as any };
}
before(async () => {
  delete process.env.ANTHROPIC_API_KEY;
  openDb(":memory:");
  server = createApp({ publicDir: process.cwd() + "/public" });
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server?.close());

// 55 (WELL_FORMED, AMBIGUOUS) · 70 (WELL_FORMED) · 40 (FULL_SENTENCE, WELL_FORMED, AMBIGUOUS) → 55, "Cần sửa"
const BAD = `- Tôi muốn đăng nhập nhanh
- Cần quản lý sản phẩm
- Dễ dùng`;

test("BR-05: lưu module có điểm QUS thấp vẫn thành công", async () => {
  const p = (await api("POST", "/api/projects", { name: "QUS" })).data;
  assert.equal(scoreStories(BAD).total, 55);
  const created = await api("POST", `/api/projects/${p.id}/modules`, { name: "Kém", requirementInput: BAD });
  assert.equal(created.status, 200);
  const saved = await api("PATCH", `/api/modules/${created.data.id}`, { requirementInput: BAD + "\n- Cần báo cáo tốt" });
  assert.equal(saved.status, 200);
  assert.match(saved.data.requirementInput, /báo cáo tốt/);
});

test("GET /api/modules/:id/qus: chấm lại nội dung hiện tại, trả điểm đã lưu, 404 khi không có module", async () => {
  const p = (await api("POST", "/api/projects", { name: "QUS 2" })).data;
  const m = (await api("POST", `/api/projects/${p.id}/modules`, { name: "Đơn hàng", requirementInput: "Là khách hàng, tôi muốn xem đơn hàng để theo dõi." })).data;
  const m2 = (await api("POST", `/api/projects/${p.id}/modules`, { name: "Trùng", requirementInput: "Là khách hàng, tôi muốn xem đơn hàng để theo dõi." })).data;

  const fresh = await api("GET", `/api/modules/${m.id}/qus`);
  assert.equal(fresh.status, 200);
  assert.equal(fresh.data.moduleId, m.id);
  assert.equal(fresh.data.result.stories.length, 1);
  // Trùng với story của module "Trùng" cùng dự án (G1) → −15
  assert.equal(fresh.data.result.total, 85);
  assert.match(fresh.data.result.stories[0].issues[0].message, /Trùng/);

  // Lưu điểm (FN-56) rồi đọc lại
  assert.equal(saveModuleQus(m2.id), 85);
  const stored = (await api("GET", `/api/modules/${m2.id}/qus`)).data;
  assert.equal(stored.score, 85);
  assert.ok(stored.checkedAt);

  // Yêu cầu trống → không có story, lưu NULL
  await api("PATCH", `/api/modules/${m2.id}`, { requirementInput: "" });
  assert.equal(saveModuleQus(m2.id), null);
  const empty = (await api("GET", `/api/modules/${m2.id}/qus`)).data;
  assert.deepEqual({ score: empty.score, checkedAt: empty.checkedAt, stories: empty.result.stories }, { score: null, checkedAt: null, stories: [] });

  assert.equal((await api("GET", "/api/modules/khong-co/qus")).status, 404);
});
