// Kiểm thử shared/exportHtml.ts (C9): HTML tĩnh tự chứa từ cây giao diện, dùng cho nút "Xuất HTML" và cho C8 (GitHub).
import { test } from "node:test";
import assert from "node:assert/strict";
import type { UINode } from "../shared/design.ts";
import { prototypeFiles, screenFileName, screenToHtml } from "../shared/exportHtml.ts";
import { mockScreen } from "../server/ai/mock.ts";

const login: UINode = {
  id: "page",
  type: "Page",
  props: { title: "Đăng nhập" },
  children: [
    {
      id: "card",
      type: "Card",
      props: { title: "Đăng nhập" },
      children: [
        { id: "email", type: "Input", props: { label: "Email", name: "email", required: true, placeholder: "ban@congty.vn" } },
        { id: "pw", type: "Input", props: { label: "Mật khẩu", name: "password", inputType: "password" } },
        { id: "remember", type: "Checkbox", props: { label: "Ghi nhớ" } },
        { id: "role", type: "Select", props: { label: "Vai trò", options: ["Khách hàng", "Quản trị"] } },
        { id: "btn_login", type: "Button", props: { label: "Đăng nhập", navigateTo: "Trang chủ" } },
        { id: "lnk", type: "Link", props: { text: "Quên mật khẩu?", navigateTo: "Quên mật khẩu" } },
        { id: "tbl", type: "Table", props: { columns: ["Mã", "Tên"], rows: [["1", "<b>Lan</b>"]], rowActions: ["Sửa"] } },
        { id: "evil", type: "Text", props: { text: '<script>alert("x")</script> & "trích"' } },
        { id: "row", type: "Row", props: { align: 'end" onmouseover="x', gap: "8" }, children: [{ id: "st", type: "Stat", props: { label: "Đơn", value: 12 } }] },
      ],
    },
  ],
};

test("screenToHtml: trang HTML đầy đủ, tự chứa (CSS nội tuyến, không script, không tài nguyên ngoài)", () => {
  const html = screenToHtml(login, { title: "Đăng nhập" });
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<meta charset="utf-8">/);
  assert.match(html, /<title>Đăng nhập<\/title>/);
  assert.match(html, /<style>[\s\S]*\.ds-btn\{/);
  assert.ok(!/<script/i.test(html), "không được có thẻ script");
  assert.ok(!/<link\b|src=|url\(http/i.test(html), "không được tải tài nguyên ngoài");
  for (const t of ["Email", "Mật khẩu", "Ghi nhớ", "Khách hàng", "Đăng nhập", "Quên mật khẩu?", "Actions", "Đơn"]) assert.ok(html.includes(t), t);
  assert.ok(html.includes('class="ds-req"'), "trường bắt buộc có dấu *");
  assert.ok(html.includes("••••••••"), "ô mật khẩu che ký tự như bản xem trước");
  assert.ok(html.includes('data-node-id="btn_login"'));
});

test("screenToHtml: thoát ký tự HTML trong nội dung và thuộc tính do AI sinh", () => {
  const html = screenToHtml(login);
  assert.ok(html.includes("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &quot;trích&quot;"));
  assert.ok(html.includes("&lt;b&gt;Lan&lt;/b&gt;"));
  assert.ok(!html.includes('onmouseover="x'), "giá trị align lạ không được chèn thuộc tính");
  assert.ok(html.includes("gap:8px"));
});

test("screenToHtml: điều hướng – có `links` thì nút/liên kết thành <a href>, không thì giữ tooltip", () => {
  const plain = screenToHtml(login);
  assert.ok(plain.includes('role="button" class="ds-btn ds-btn-primary" title="&#8594; Trang chủ"'));
  const linked = screenToHtml(login, { links: { "trang chu": "trang-chu.html", "Quên mật khẩu": "quen.html" } });
  assert.ok(linked.includes('<a data-node-id="btn_login" href="trang-chu.html" class="ds-btn ds-btn-primary"'));
  assert.ok(linked.includes('href="quen.html" class="ds-link"'));
});

test("prototypeFiles: mỗi màn một tệp + index.html, nối điều hướng giữa các màn, tên tệp không trùng", () => {
  const home: UINode = { id: "p", type: "Page", props: { title: "Trang chủ" }, children: [{ id: "h", type: "Heading", props: { text: "Xin chào" } }] };
  const files = prototypeFiles(
    [
      { name: "Đăng nhập", tree: login },
      { name: "Trang chủ", tree: home },
      { name: "Đăng   nhập", tree: home },
    ],
    { title: "Module Xác thực" },
  );
  assert.deepEqual(
    files.map((f) => f.path),
    ["dang-nhap.html", "trang-chu.html", "dang-nhap-2.html", "index.html"],
  );
  assert.ok(files[0].html.includes('href="trang-chu.html" class="ds-btn'));
  assert.ok(files[0].html.includes('href="index.html"'), "có liên kết về danh sách");
  const index = files.at(-1)!.html;
  assert.ok(index.includes("Module Xác thực") && index.includes('href="dang-nhap.html"') && index.includes('href="trang-chu.html"'));
  assert.ok(!/<script/i.test(index));
});

test("screenFileName và mọi loại component của bản mock đều xuất được", () => {
  assert.equal(screenFileName("Quản lý Sản phẩm / Đơn hàng"), "quan-ly-san-pham-don-hang.html");
  assert.equal(screenFileName("!!!"), "screen.html");
  for (const prompt of ["Dashboard tổng quan: chỉ số doanh thu, bảng đơn hàng, phân trang", "Form thêm sản phẩm: tên, giá, ngày nhập, mô tả, ảnh; nút Lưu", "Màn hình đăng nhập"]) {
    const html = screenToHtml(mockScreen(prompt, "Mẫu"));
    assert.ok(html.length > 500);
    assert.ok(!html.includes(`class="ds-unknown"`), `component chưa xuất được: ${prompt}`);
  }
});
