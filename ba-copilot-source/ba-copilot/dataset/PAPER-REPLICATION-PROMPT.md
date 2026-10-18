# Tái lập Li et al. 2020 – "Auto Completion of UI Layout Design Using Transformer-Based Tree Decoders" (arXiv:2001.05308)

## A. Tóm tắt bài báo

### Bài toán (mục 3)
- Cây giao diện Ĝ có |Ĝ| node. Mỗi node i mang 5 thuộc tính (cᵢ, dᵢ, tᵢ, pᵢ, bᵢ):
  - cᵢ: loại component (25 loại);
  - dᵢ: độ sâu trong cây;
  - tᵢ: node lá hay không;
  - pᵢ: chỉ số của node cha;
  - bᵢ = (x, y, x̂, ŷ): khung bao (góc trên trái và góc dưới phải).
- Cây dở P̂ gồm k < |Ĝ| node và phải "đóng" theo quan hệ cha: có gốc, và cha của mọi node trong P̂ cũng nằm trong P̂.
- Nhiệm vụ: dự đoán cây đầy đủ Ĝ' = F(P̂). Mô hình chỉ có bộ giải mã, không có bộ mã hóa.

### Phương pháp (mục 4)
- **Biểu diễn node (Eq. 1–5):**
  - Embedding one-hot cho loại cᵢ và cờ lá tᵢ.
  - Mỗi tọa độ được rời rạc hóa và có embedding riêng, kích thước |E|/4. Bốn embedding tọa độ ghép lại thành eᵇ, đóng vai trò positional embedding (giống Image Transformer).
  - Embedding của node: eᵢ = eᵇ + eᶜ + eᵗ.
- **Bộ giải mã Transformer (Eq. 6):** multi-head self-attention theo kiểu nhân quả, mỗi bước chỉ nhìn các bước trước.
- **Ba biến thể:**
  1. **Vanilla:**
     - Duỗi cây theo thứ tự DFS tiền thứ tự, chèn token "(" và ")" quanh các con của mỗi cha (trừ cha chỉ có 1 con).
     - Sinh tự hồi quy, mỗi thuộc tính một softmax riêng (Eq. 7). Node cha suy ra từ các dấu ngoặc.
     - Đòi hỏi cây dở phải là tiền tố DFS.
  2. **Pointer:**
     - Không dùng dấu ngoặc. Node cha pᵢ được dự đoán bằng softmax trên tích vô hướng giữa trạng thái ẩn hᵢ và trạng thái ẩn của mọi node trước (Eq. 8, giống Pointer Network).
     - Duyệt được theo thứ tự bất kỳ.
  3. **Recursive:**
     - Dùng chung một bộ giải mã cho từng node cha, giải mã từ gốc xuống.
     - Self-attention chỉ trên cha và các anh em (Eq. 9), rồi chú ý thêm tới trạng thái ẩn của các tổ tiên (Eq. 10).
     - Không duỗi cây, không cần con trỏ, và chạy batch được cho nhiều cây như một rừng.

### Dữ liệu (mục 5.1)
- Rico (Liu et al. 2018): khoảng 60 nghìn giao diện Android, có nhãn ngữ nghĩa với 25 loại component.
- Lọc dữ liệu:
  - bỏ layout có node nằm ngoài màn hình hoặc ngoài khung của cha;
  - bỏ cây có hơn 100 node hoặc có cha có hơn 30 con.
- Sau lọc còn hơn 55 nghìn cây:
  - trung bình 16 node mỗi cây (tối thiểu 2, tối đa 49);
  - độ sâu trung bình 3 (tối thiểu 2, tối đa 5);
  - tọa độ thu về lưới 72×128.
- Chia ngẫu nhiên train / val / test theo tỷ lệ 80 / 10 / 10.

### Thiết lập cây dở (mục 5.3)
- Hai luồng thiết kế: **BFS** (dựng khung trước) và **DFS** (làm xong từng container).
- Mỗi luồng cho mô hình xem **10%, 50% hoặc 80%** số node đầu tiên.
- Số cách hoàn thiện trung bình: BFS 2,97 / 1,23 / 1,17; DFS 3,63 / 1,24 / 1,17.

### Thước đo (mục 5.2)
1. **Layout Tree Edit Distance:**
   - Khoảng cách sửa cây tối ưu Zhang–Shasha, với ba phép sửa Insert, Delete, Change.
   - Chi phí quy theo KLM-GOMS:
     - Insert: chọn trên bảng công cụ, kéo thả, chỉnh kích thước;
     - Change: chuột phải để đổi loại, kéo để sửa vị trí hoặc kích thước;
     - Delete: chi phí tối thiểu.
   - Càng thấp càng tốt.
2. **Parent-Child Pair Retrieval:**
   - Mỗi cặp là bộ (c_p, x_p, y_p, x̂_p, ŷ_p, c_s, x_s, y_s, x̂_s, ŷ_s).
   - Một cặp chỉ tính là đúng khi khớp toàn bộ.
   - Báo cáo Precision, Recall và **F1**.
3. **Next-Element Prediction Accuracy:** cho tiền tố theo thứ tự BFS hoặc DFS, đoán đúng phần tử kế tiếp.

### Huấn luyện và kết quả
- Cài đặt bằng Tensor2Tensor:
  - dò hidden size trong {128, 256, 512} và số lớp trong {2, 4, 6};
  - batch 128 cây, huấn luyện tới khi hội tụ.
- Kết quả chính:
  - Recursive tốt nhất về Next trong mọi thiết lập, ví dụ BFS 80% đạt 36,58%.
  - Pointer tốt hơn về F1 và Edit ở mức 50–80%.
  - Vanilla kém nhất.
- Bản đo nới lỏng (chỉ so loại và cấu trúc), Next ở mức 80%:
  - BFS: Recursive 95,3%, Pointer 92,9%;
  - DFS: Recursive 93,4%, Pointer 88,4%, Vanilla 76,6%.

### Khác biệt về dữ liệu khi tái lập
- Bài báo dùng Rico: màn **điện thoại Android**, khổ dọc, lưới 72×128.
- Dữ liệu của nhóm là **giao diện web nghiệp vụ** (màn desktop khổ ngang, trang có thể cuộn dài):
  - 200 màn gốc do Claude soạn theo `dataset/AUTHORING.md`;
  - 28 loại component của BA Copilot.
- Lưới tọa độ vì vậy phải đổi cho khổ web (xem phần B).
- **Không dùng WebSight** và **không dùng mô hình cũ tiền huấn luyện WebSight** (`model/next-transformer.websight.json`, cũng như `model/next-transformer.json` hiện tại vì nó được tinh chỉnh từ mô hình đó).

---

## B. Prompt tái lập (dán cho Claude Code trong repo này)

```
Bối cảnh: repo BA Copilot (ba-copilot-source/ba-copilot). Đọc dataset/PAPER-REPLICATION-PROMPT.md phần A (tóm tắt Li et al. 2020).
Mục tiêu: tái lập phương pháp nhẹ nhất của bài báo – Vanilla Transformer Tree Decoder (mục 4.2) – trên dữ liệu UI WEB do nhóm tạo,
đánh giá đúng 3 thước đo của bài báo (mục 5.2) với luồng thiết kế DFS (mục 5.3).

RÀNG BUỘC
- CHỈ dùng dữ liệu trong dataset/roots/*.json (200 màn gốc web nghiệp vụ, Claude soạn). Không tải, không đọc WebSight, Rico hay data/corpus.
- Không dùng, không khởi tạo từ model/next-transformer.json hay model/next-transformer.websight.json (đều dính WebSight).
- Không dùng dữ liệu từ bộ sinh Mock. Không thay mô hình của app.
- Chạy được trên CPU 4 nhân (PyTorch đã cài).

1. Bộ dữ liệu cây web có tọa độ (scripts/paper/build-dataset.ts → data/paper/{train,val,test}.jsonl + stats.json)
   - Render từng màn gốc bằng client/components/Renderer.tsx trong Chromium (executablePath /opt/pw-browsers/chromium-1194/chrome-linux/chrome),
     khung nhìn desktop: độ rộng 1280 px (train/val thêm 1024 và 1440 px làm biến thể bố cục), đo getBoundingClientRect theo data-node-id,
     tọa độ tính theo toàn trang (kể cả phần cuộn).
   - Rời rạc hóa cho khổ WEB: ô lưới 10 px; x ∈ [0, W/10) (128 ô với 1280 px; chuẩn hóa mọi độ rộng về 128 ô theo tỷ lệ),
     y ∈ [0, 256) (tối đa 2560 px, phần dài hơn kẹp vào ô cuối). Ghi rõ lưới trong stats.json.
   - Mỗi node: {c: loại (28 loại của app), t: lá?, b: [x, y, x2, y2], k: [con]}; độ sâu và cha suy từ cấu trúc.
   - Lọc như bài báo: node không hiển thị hoặc ra ngoài khung cha (dung sai 2 px) → bỏ cây; > 100 node hoặc cha > 30 con → bỏ cây.
   - Chia theo màn gốc bằng splitOf trong scripts/dataset/build-samples.ts (≈ 80/10/10 theo hash); mọi biến thể của một màn cùng tập;
     test chỉ dùng độ rộng 1280 px. Chốt tập test trước khi huấn luyện.
   - Thống kê như mục 5.1: số cây, số node TB/min/max, độ sâu TB/min/max, phân bố loại, số cây bị lọc theo lý do,
     số cách hoàn thiện TB của cây dở DFS 10/50/80% (đếm cây trong tập cùng tiền tố).

2. Vanilla Transformer Tree Decoder (scripts/paper/vanilla.py)
   - Duỗi cây theo DFS tiền thứ tự; thêm token "(" và ")" quanh các con của mỗi cha (bỏ ngoặc khi cha chỉ có 1 con, đúng bài báo,
     và kiểm tra khôi phục được cây), thêm EOS.
   - Embedding Eq.1–5: e = e_b + e_c + e_t, với e_b = ghép 4 embedding tọa độ (mỗi cái |E|/4); token ngoặc/EOS chỉ có e_c.
   - Bộ giải mã Transformer nhân quả (Eq.6); đầu ra softmax riêng cho c, t, x, y, x2, y2 (Eq.7); với token ngoặc chỉ tính loss của c.
   - Cấu hình rút gọn cho CPU: dò hidden ∈ {64, 128}, số lớp ∈ {2, 4}, 4 head, dropout 0,1, AdamW; early stopping theo loss val;
     seed cố định. Ghi lịch sử loss và thời gian huấn luyện.
   - Giải mã tham lam (greedy) tới EOS hoặc khi ngoặc gốc đóng; tối đa 100 node; khôi phục cây từ ngoặc.

3. Đánh giá (scripts/paper/eval_vanilla.py) trên tập test, cây dở = tiền tố DFS gồm 10%, 50%, 80% số node
   (Vanilla chỉ hỗ trợ DFS – ghi rõ không có BFS):
   - Next-element accuracy: node đầu tiên mô hình sinh sau tiền tố so với node kế tiếp thật; báo cáo bản CHẶT (loại + 4 tọa độ khớp)
     và bản NỚI LỎNG (chỉ loại); kèm Top-3 theo loại.
   - Parent-child pair Precision/Recall/F1 giữa cây mô hình hoàn thiện và cây thật: bản CHẶT (loại + tọa độ cha và con khớp tuyệt đối)
     và bản NỚI LỎNG (chỉ loại); đếm theo đa tập.
   - Layout Tree Edit Distance Zhang–Shasha, chi phí KLM như scripts/tree-metrics.ts (chèn 5,05 s, đổi 3,95 s, xóa 0,10 s);
     bản chặt coi sai tọa độ là một phép Change.
   - Mốc so sánh: "Không gợi ý" (giữ nguyên cây dở). Có thể thêm Transformer phát hiện chỗ thiếu của app huấn luyện TỪ ĐẦU trên
     dataset (scripts/train_transformer.py --samples, KHÔNG --init) – chỉ bản nới lỏng vì không đoán tọa độ.
   - Xuất bảng kiểu Table 2 của bài báo (DFS 10/50/80% × F1/Next/Edit, chặt và nới lỏng):
     dataset/export/eval/paper-vanilla.md + .json, kèm thống kê dữ liệu.

4. Kiểm chứng: test cho chuyển cây ↔ chuỗi Vanilla (khôi phục đúng cây, kể cả cha 1 con), tiền tố DFS, Zhang–Shasha, pair F1.
   Chạy npm test. Commit và push lên nhánh trung_ba.

5. Báo cáo cuối: bảng kết quả, so sánh định tính với Table 2 (lưu ý khác dữ liệu: web vs Android, 200 màn vs 55 nghìn, lưới khác),
   thời gian CPU, và giới hạn (dữ liệu do Claude soạn, chưa qua BA kiểm nghiệm; tập test ~23 màn; tọa độ từ một độ rộng màn hình).
```
