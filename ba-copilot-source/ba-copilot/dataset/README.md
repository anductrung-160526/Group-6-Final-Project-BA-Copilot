# Bộ dữ liệu "bổ sung UI" (UI completion)

Bộ dữ liệu này dùng để huấn luyện và đánh giá tính năng **Gợi ý phần tử còn thiếu** trong Design Studio. Mỗi mẫu là một cặp
*màn đang thiếu → phần cần bổ sung*, kèm yêu cầu nghiệp vụ và quyền của người dùng.

## Số liệu (phiên bản dữ liệu `80d9c12d5a`)

| | Số lượng |
|---|---|
| Màn gốc | **200** (R001–R200): 50 màn đợt thử (`pilot-*.json`) và 150 màn chính (`main-0[1-6].json`) |
| Mẫu | **10.012** |
| Chia theo màn gốc (train / val / test) | 153 / 24 / 23 màn → 7.595 / 1.172 / 1.245 mẫu |
| Kích thước màn gốc | 10–38 node, trung bình 14,6 |

Ma trận phủ (`matrix.json`, seed cố định) chia đều 5 nhóm màn, mỗi nhóm 40 màn: auth, list, form, approval, state.
Ma trận phủ thêm 12 miền nghiệp vụ, 5 mức quyền và 6 kiểu bố cục.

### Các loại mẫu

| Kiểu | Số mẫu | Tỷ lệ | Mô tả |
|---|---|---|---|
| `missing_one` | 1.407 | 14,1% | Bỏ 1 phần tử chức năng: nút, ô nhập, bộ lọc, bảng, phân trang, thông báo, chỉ số… |
| `missing_pair` | 417 | 4,2% | Bỏ 2 phần tử anh em, ví dụ cặp nút Lưu + Hủy |
| `missing_group` | 609 | 6,1% | Bỏ 1 cụm (Row nút, thanh lọc, Form, Section, Modal…). Đáp án là chèn cả cụm |
| `missing_multi` | 7.379 | 73,7% | Bỏ 2–4 phần tử hoặc cụm rải rác, không lồng nhau, không liền kề trong cùng cha. Mô phỏng màn làm dở ở nhiều chỗ |
| `complete` | 200 | 2,0% | Màn đã đủ, đáp án rỗng. Trong đó **140 mẫu bẫy** là màn bị giới hạn quyền (chỉ xem, chỉ tạo, chỉ duyệt, chỉ bản ghi của mình) |

**Quy tắc xóa phần tử:**
- Không xóa Heading, Text, Image, Divider, Avatar đơn lẻ, vì khó đoán và ít giá trị với BA.
- Mỗi biến thể là một tập id bị bỏ khác nhau; các biến thể trùng nhau bị loại.
- Patch chèn lại được kiểm tra tự động: áp patch vào `partialTree` phải ra đúng `completedTree`.
- Màn nhỏ có ít tổ hợp nên có ít mẫu hơn (`--per-root 67` là mức trần).

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
npx tsx scripts/dataset/matrix.ts                 # dataset/matrix.json (200 màn)
npm run dataset:validate                          # kiểm tra màn gốc
npm run dataset:samples                           # data/dataset/samples.jsonl + stats.json (10.012 mẫu)
npm run dataset:export                            # data/dataset/tf/{train,val,test}.jsonl cho Transformer
npx tsx scripts/dataset/export-view.ts            # dataset/export/: samples.csv, roots.csv, preview.html, samples.jsonl.gz
```
