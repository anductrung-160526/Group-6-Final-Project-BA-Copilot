# Bộ dữ liệu "bổ sung UI" (UI completion)

Bộ dữ liệu này dùng để huấn luyện và đánh giá tính năng **Gợi ý phần tử còn thiếu** trong Design Studio. Mỗi mẫu là một cặp
*màn đang thiếu → phần cần bổ sung*, kèm yêu cầu nghiệp vụ và quyền của người dùng.

## Số liệu (phiên bản dữ liệu `a2e83358b8`)

| | Số lượng |
|---|---|
| Màn gốc | **200** (R001–R200): 50 màn đợt thử (`pilot-*.json`), 100 màn chính (`main-0[1-6].json`), 50 màn thay thế để tăng đa dạng (`div-0[1-2].json`) |
| Mẫu | **11.240** |
| Chia theo màn gốc (train / val / test) | 153 / 24 / 23 màn → 8.555 / 1.297 / 1.388 mẫu |
| Kích thước màn gốc | 10–38 node, trung bình 16,8 |

Ma trận phủ (`matrix.json`, seed cố định) có **50 loại màn** thuộc 7 nhóm:
auth 20, list 30, form 39, approval 29, state 32, **workspace 26**, **data 24**. Ma trận phủ thêm 12 miền nghiệp vụ, 5 mức quyền và 6 kiểu bố cục.

**Tăng đa dạng (`matrix-overrides.json`):** 50 màn được đổi sang 25 loại màn web mới, mỗi loại 2 màn:
- Nhóm workspace: Kanban, lịch, hộp thư, hội thoại, trung tâm thông báo, timeline, trang chủ portal, tìm kiếm toàn cục, thư viện tài liệu, trung tâm cài đặt, hồ sơ 360°, lịch trực, trợ giúp/FAQ.
- Nhóm data: nhập Excel, tải tệp, so sánh, xem trước bản in, xuất báo cáo, giỏ hàng, bảng giá, khảo sát, quy tắc tự động, nhật ký kiểm toán, KPI so sánh kỳ, ma trận phân quyền.

Các màn bị thay gồm: một nửa số màn auth, các màn thuộc cặp giống nhau ≥ 75%, và các màn nhỏ nhất.
`npm run dataset:validate` báo độ đa dạng của cả bộ: Jaccard trung bình 0,133 trên đa tập cặp loại cha–con; 4 cặp ≥ 70% (cao nhất 77%); 200/200 tên khác nhau.

### Các loại mẫu

| Kiểu | Số mẫu | Tỷ lệ | Mô tả |
|---|---|---|---|
| `missing_one` | 1.553 | 13,8% | Bỏ 1 phần tử chức năng: nút, ô nhập, bộ lọc, bảng, phân trang, thông báo, chỉ số… |
| `missing_pair` | 470 | 4,2% | Bỏ 2 phần tử anh em, ví dụ cặp nút Lưu + Hủy |
| `missing_group` | 731 | 6,5% | Bỏ 1 cụm (Row nút, thanh lọc, Form, Section, Modal…). Đáp án là chèn cả cụm |
| `missing_multi` | 8.286 | 73,7% | Bỏ 2–4 phần tử hoặc cụm rải rác, không lồng nhau, không liền kề trong cùng cha |
| `complete` | 200 | 1,8% | Màn đã đủ, đáp án rỗng. Trong đó **156 mẫu bẫy** là màn bị giới hạn quyền |

**Quy tắc xóa phần tử:**
- Không xóa Heading, Text, Image, Divider, Avatar đơn lẻ, vì khó đoán và ít giá trị với BA.
- Mỗi biến thể là một tập id bị bỏ khác nhau; các biến thể trùng nhau bị loại.
- Patch chèn lại được kiểm tra tự động: áp patch vào `partialTree` phải ra đúng `completedTree`.
- Màn nhỏ có ít tổ hợp nên có ít mẫu hơn (`--per-root 67` là mức trần).

## Xem dữ liệu có ảnh (định dạng giống WebSight) – `export/websight/`

- **Xem ngay:** mở `export/websight/index.html` bằng trình duyệt. Trang gồm lưới 200 màn có ảnh, ô tìm kiếm và bộ lọc theo nhóm. Bấm một màn để xem ảnh lớn, mô tả và mã HTML.
- **File riêng từng màn:**
  - `images/<id>.png`: ảnh chụp toàn trang khổ 1280 px;
  - `html/<id>.html`: HTML tĩnh render từ cây bằng Renderer của app, dùng chung `styles.css`;
  - `metadata.jsonl`: mô tả và cây JSON.
- **Parquet giống WebSight:** `{train,val,test}.parquet`.
  - Cột giống WebSight: `image` (PNG), `text` (HTML), `llm_generated_idea` (tiêu đề và mô tả nghiệp vụ).
  - Cột thêm: `id, group, screenKind, domain, permission, layout, actor, tree`.
  - Đọc bằng: `datasets.load_dataset("parquet", data_files={"train": "train.parquet", …})`.
- **Tạo lại:**
  `CHROME=<chromium> npx tsx scripts/dataset/export-websight.tsx && python3 scripts/dataset/websight_parquet.py` (cần `pip install pyarrow`).

## Định dạng một mẫu (`data/dataset/samples.jsonl`, bản nén ở `export/samples.jsonl.gz`)

`id, rootId, split, kind, trap, meta{group, screenKind, domain, permission, layout}, requirement{title, actor, description, permissions, rules},
partialTree, targetContainerId, acceptedPatch[{op:"insert", parentId, index, node}], acceptedAlternatives, completedTree, review`

## Nguồn và giới hạn

- Màn gốc do **Claude soạn tay** theo `AUTHORING.md`. Phiên làm việc không có `ANTHROPIC_API_KEY`, nên màn gốc **không** đi qua
  nút *Sinh thiết kế* của app. Màn được soạn bằng DSL trong `src/` (`python3 dataset/src/batch_main1.py` …) rồi kiểm tra bằng
  `npm run dataset:validate`: đúng schema 28 component, id snake_case duy nhất, 10–70 node, cảnh báo vi phạm quyền.
- `review.status = "unreviewed"`: nhóm kiểm nghiệm màn theo cách riêng. Kết quả kiểm nghiệm đưa vào bằng
  `build-samples.ts --reviews kq.json [--only-reviewed]`.
- Không dùng dữ liệu Mock hay WebSight trong bộ này. WebSight chỉ xuất hiện dưới dạng mô hình tiền huấn luyện có sẵn
  (`model/next-transformer.json` cũ), và kết quả được báo cáo cả có lẫn không có bước tiền huấn luyện này.
- Mô hình hiện **chưa** nhận cờ quyền nghiệp vụ làm đầu vào. Các mẫu bẫy chỉ dùng để đo báo động giả.

## Tái tạo

```bash
npx tsx scripts/dataset/matrix.ts                 # dataset/matrix.json (200 màn, áp matrix-overrides.json)
for f in dataset/src/batch_*.py; do python3 $f; done  # dựng lại dataset/roots từ DSL
npm run dataset:validate                          # kiểm tra màn gốc
npm run dataset:samples                           # data/dataset/samples.jsonl + stats.json (11.240 mẫu)
npm run dataset:export                            # data/dataset/tf/{train,val,test}.jsonl cho Transformer
npx tsx scripts/dataset/export-view.ts            # dataset/export/: samples.csv, roots.csv, preview.html, samples.jsonl.gz
```

> Mô hình của app đã được huấn luyện lại từ đầu trên phiên bản này, không dùng WebSight. Kết quả và lý do chọn mô hình ở `export/eval/MODEL-SELECTION.md`.
> Các báo cáo cũ `REPORT.md` và `PAPER-METRICS.md` thuộc phiên bản trước (`80d9c12d5a`) và mô hình có tiền huấn luyện WebSight.
