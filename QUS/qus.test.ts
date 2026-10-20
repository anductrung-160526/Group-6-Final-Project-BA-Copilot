import { test } from "node:test";
import assert from "node:assert/strict";
import { splitStories, scoreStories, BASE_SCORE, PENALTY_ERROR, PENALTY_WARN, PENALTY_INFO } from "./qus.ts";

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

  // Set issues: tập này có cả story mẫu và tự do -> NOT_UNIFORM
  assert.ok(res.setIssues.some((i) => i.code === "NOT_UNIFORM"), "tập hỗn hợp phải có NOT_UNIFORM");
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

test("Tiêu chí DUPLICATE: stories khác biệt vs stories trùng lặp Jaccard >= 0.7", () => {
  // Khác biệt
  const diffRes = scoreStories(`- As a reader, I want to bookmark articles so that I can read later.
- As an admin, I want to manage billing plans so that subscriptions work.`);
  assert.ok(!diffRes.setIssues.some((i) => i.code === "DUPLICATE"));

  // Trùng lặp
  const dupRes = scoreStories(`- As a reader, I want to bookmark articles so that I can read them later.
- As a reader, I want to bookmark articles so that I can read later.`);
  assert.ok(dupRes.setIssues.some((i) => i.code === "DUPLICATE"));
  assert.ok(dupRes.setIssues[0].message.includes("Story #1 và Story #2"));
});

test("Tiêu chí NOT_UNIFORM: tập đồng nhất vs tập lẫn lộn", () => {
  const uniform = scoreStories(`- As a user, I want to login so that I get in.
- As a user, I want to logout so that I exit.`);
  assert.ok(!uniform.setIssues.some((i) => i.code === "NOT_UNIFORM"));

  const mixed = scoreStories(`- As a user, I want to login so that I get in.
- Cho phép người dùng xuất hóa đơn PDF.`);
  assert.ok(mixed.setIssues.some((i) => i.code === "NOT_UNIFORM"));
});

test("Các trường hợp biên: chuỗi rỗng, khoảng trắng, 1 story, đánh số, tiếng Việt có dấu, hoa thường", () => {
  // Rỗng và khoảng trắng
  const emptyRes = scoreStories("");
  assert.deepEqual(emptyRes.stories, []);
  assert.equal(emptyRes.total, 0);
  assert.deepEqual(emptyRes.setIssues, []);

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
  const terrible = scoreStories("x");
  assert.ok(terrible.stories[0].score >= 0 && terrible.stories[0].score <= 100);
  assert.ok(terrible.total >= 0 && terrible.total <= 100);

  // Hàm thuần: gọi 2 lần ra cùng kết quả
  const run1 = scoreStories(FIXTURE_MAIN);
  const run2 = scoreStories(FIXTURE_MAIN);
  assert.deepEqual(run1, run2);
});
