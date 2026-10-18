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

### So với BA Copilot hiện tại
- BA Copilot dùng một Transformer **hai chiều** để phát hiện chỗ thiếu (không tự hồi quy).
- Không có tọa độ; thay bằng loại con có nghĩa và độ sâu.
- Mới tái lập các thước đo ở **bản nới lỏng**.

---

## B. Prompt tái lập (dán cho Claude Code trong repo này)

```
Bối cảnh: repo BA Copilot (ba-copilot-source/ba-copilot). Đọc dataset/PAPER-REPLICATION-PROMPT.md phần A (tóm tắt Li et al. 2020).
Mục tiêu: tái lập bài báo trên dữ liệu nghiệp vụ của nhóm, so sánh 3 bộ giải mã của bài báo với mô hình hiện tại của app.
KHÔNG thay model/next-transformer.json của app trừ khi tôi đồng ý sau khi xem kết quả.

1. Bộ dữ liệu "kiểu Rico" (scripts/paper/build-dataset.ts → data/paper/{train,val,test}.jsonl + stats.json):
   - Nguồn: cây đầy đủ trong dataset/roots/*.json (200 màn gốc). Thêm WebSight nếu data/corpus có sẵn, ghi rõ nguồn từng cây.
   - Tọa độ: render từng cây bằng client/components/Renderer.tsx trong Chromium (/opt/pw-browsers, viewport 1280×800),
     đo getBoundingClientRect theo data-node-id; chuẩn hóa về lưới 72×128 như bài báo (ghi lại tỷ lệ gốc).
   - Mỗi node: {c: loại (28 loại của app), d: độ sâu, t: lá?, p: chỉ số cha theo tiền thứ tự, b: [x,y,x2,y2]}.
   - Lọc như bài báo: node ra ngoài màn hoặc ngoài khung cha → bỏ cây; >100 node hoặc cha >30 con → bỏ.
   - Tăng cỡ dữ liệu nếu cần: biến thể bố cục (đổi viewport 1024/1440, đổi thứ tự anh em có thể hoán đổi), KHÔNG sinh từ bộ Mock.
   - Chia theo màn gốc (splitOf trong scripts/dataset/build-samples.ts) 80/10/10, mọi biến thể của một màn cùng tập.
   - Báo cáo: số cây, số node TB/min/max, độ sâu TB/min/max, phân bố loại, số cách hoàn thiện TB cho cây dở BFS/DFS 10/50/80%.

2. Ba mô hình của bài báo (scripts/paper/train.py, PyTorch CPU; đã cài torch):
   - Embedding Eq.1–5: loại + lá + 4 tọa độ rời rạc (mỗi cái |E|/4, ghép làm positional embedding).
   - Vanilla: duỗi DFS có "(" ")", tự hồi quy, softmax riêng cho c, t, x, y, x2, y2 (Eq.7).
   - Pointer: thêm đầu ra cha bằng softmax tích vô hướng với trạng thái ẩn trước (Eq.8); huấn luyện cả thứ tự BFS và DFS.
   - Recursive: giải mã con của từng cha, self-attention trên cha+anh em (Eq.9) rồi chú ý tổ tiên (Eq.10).
   - Dò hidden ∈ {128,256} và số lớp ∈ {2,4} trên tập val (rút gọn cho CPU), early stopping theo val, seed cố định.
   - Giải mã: greedy cho tới EOS; giới hạn 100 node.

3. Đánh giá (scripts/paper/eval.py) trên tập test, cây dở BFS và DFS 10/50/80%:
   - Next-element accuracy (Top-1, kèm Top-3).
   - Parent-child pair P/R/F1, bản CHẶT (loại + tọa độ khớp tuyệt đối trên lưới 72×128) và bản NỚI LỎNG (chỉ loại).
   - Layout Tree Edit Distance Zhang–Shasha, chi phí KLM như scripts/tree-metrics.ts (chèn 5,05 s, đổi 3,95 s, xóa 0,1 s);
     bản chặt tính thêm phép Change khi sai vị trí/kích thước.
   - Mốc: "không gợi ý" (giữ cây dở) và mô hình hiện tại của app (model/next-transformer.json, chỉ có bản nới lỏng vì không đoán tọa độ;
     tái dùng scripts/eval-transformer.ts).
   - Xuất bảng giống Table 1–2 của bài báo: dataset/export/eval/paper-replication.md (+ .json).

4. Kiểm chứng: viết test nhỏ cho Zhang–Shasha, pair F1, chuyển cây ↔ chuỗi Vanilla (khôi phục đúng cây), thứ tự BFS/DFS.
   Chạy npm test. Commit và push lên nhánh trung_ba.

5. Báo cáo cuối: bảng so sánh, nhận xét mô hình nào hợp với tính năng gợi ý của app, và giới hạn
   (dữ liệu do Claude soạn, chưa qua BA kiểm nghiệm; tập test nhỏ; tọa độ lấy từ một kích thước màn hình).
```
