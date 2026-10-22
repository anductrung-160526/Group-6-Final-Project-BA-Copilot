// Registry route v2: mỗi phân hệ một tệp, tự đăng ký bằng route() khi được import.
// Tệp này do C2 sở hữu (trước là A2) – agent tính năng chỉ sửa tệp route của mình, không sửa danh sách dưới đây.

import "./members.ts"; // A3 → C3 – thành viên, quản trị
import "./files.ts"; // A4 – FN-04 → FN-10
import "./diagram.ts"; // A5 → C6 – sơ đồ UC cũ (uc_diagrams)
import "./tasks.ts"; // A6 → C7 – FN-15 → FN-19
import "./qus.ts"; // A8 → C4 – FN-56
import "./suggest.ts"; // A9 – FN-57 → FN-61

// Đợt 5 – khung do C2 tạo, chủ sở hữu ghi trong từng tệp
import "./stories.ts"; // C4 – user story cấp dự án
import "./docs.ts"; // C5 – 5 tài liệu theo bước
import "./diagrams.ts"; // C6 – 5 sơ đồ theo bước
import "./approval.ts"; // C7 – Xong / Duyệt / Yêu cầu sửa
import "./git.ts"; // C8 – GitHub
import "./prototype.ts"; // C9 – xuất HTML tĩnh
