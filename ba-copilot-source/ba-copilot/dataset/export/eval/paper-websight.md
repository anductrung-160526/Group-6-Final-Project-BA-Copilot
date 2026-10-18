N-gram (cùng dữ liệu): 0 cây · Transformer: 478702 tham số, 23881 cây

## 1. Thước đo của Li et al. 2020 (bản nới lỏng theo loại) – F1 (%), Next (%), Edit (giây KLM; chèn 5.05 s, đổi loại 3.95 s, xóa 0.10 s)

### Bộ dữ liệu bổ sung UI – màn gốc tập test – luồng BFS (Next: 23 cây, F1/Edit: 23 cây)

| Mô hình | BFS 10% F1 | Next | Next Top-3 | Edit | BFS 50% F1 | Next | Next Top-3 | Edit | BFS 80% F1 | Next | Next Top-3 | Edit |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Không gợi ý (giữ cây dở) | 15.2 | – | – | 61.0 | 64.6 | – | – | 34.5 | 86.8 | – | – | 15.4 |
| N-gram | 15.2 | 0.0 | 17.4 | 61.0 | 64.6 | 0.0 | 8.7 | 34.5 | 86.8 | 0.0 | 0.0 | 15.4 |
| Transformer | 28.1 | 8.7 | 52.2 | 47.5 | 61.7 | 0.0 | 47.8 | 29.8 | 84.3 | 21.7 | 43.5 | 12.0 |

### Bộ dữ liệu bổ sung UI – màn gốc tập test – luồng DFS (Next: 23 cây, F1/Edit: 23 cây)

| Mô hình | DFS 10% F1 | Next | Next Top-3 | Edit | DFS 50% F1 | Next | Next Top-3 | Edit | DFS 80% F1 | Next | Next Top-3 | Edit |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Không gợi ý (giữ cây dở) | 15.2 | – | – | 61.0 | 64.6 | – | – | 34.5 | 86.8 | – | – | 15.4 |
| N-gram | 15.2 | 0.0 | 0.0 | 61.0 | 64.6 | 0.0 | 4.3 | 34.5 | 86.8 | 0.0 | 4.3 | 15.4 |
| Transformer | 27.8 | 0.0 | 73.9 | 47.7 | 61.8 | 8.7 | 34.8 | 32.1 | 84.7 | 26.1 | 47.8 | 13.5 |

### 30 màn tham chiếu – luồng BFS (Next: 30 cây, F1/Edit: 30 cây)

| Mô hình | BFS 10% F1 | Next | Next Top-3 | Edit | BFS 50% F1 | Next | Next Top-3 | Edit | BFS 80% F1 | Next | Next Top-3 | Edit |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Không gợi ý (giữ cây dở) | 15.8 | – | – | 75.7 | 65.5 | – | – | 42.1 | 86.9 | – | – | 18.5 |
| N-gram | 15.8 | 0.0 | 3.3 | 75.7 | 65.5 | 3.3 | 6.7 | 42.1 | 86.9 | 0.0 | 0.0 | 18.5 |
| Transformer | 28.6 | 3.3 | 40.0 | 59.6 | 67.1 | 23.3 | 26.7 | 35.2 | 84.5 | 16.7 | 33.3 | 15.2 |

### 30 màn tham chiếu – luồng DFS (Next: 30 cây, F1/Edit: 30 cây)

| Mô hình | DFS 10% F1 | Next | Next Top-3 | Edit | DFS 50% F1 | Next | Next Top-3 | Edit | DFS 80% F1 | Next | Next Top-3 | Edit |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Không gợi ý (giữ cây dở) | 15.8 | – | – | 75.7 | 65.5 | – | – | 42.1 | 86.9 | – | – | 18.5 |
| N-gram | 15.8 | 0.0 | 3.3 | 75.7 | 65.5 | 3.3 | 10.0 | 42.1 | 86.9 | 0.0 | 3.3 | 18.5 |
| Transformer | 30.9 | 30.0 | 83.3 | 57.1 | 67.7 | 43.3 | 50.0 | 38.1 | 85.0 | 20.0 | 46.7 | 16.2 |


## 2. Tìm phần tử bị thiếu (xóa 1 node, xếp hạng mọi vị trí × loại)

| Tập | n | N-gram Hit@1 | N-gram Hit@3 | Transformer Hit@1 | Transformer Hit@3 | Đúng vị trí (Top-1) | Được gợi ý ở ngưỡng app |
|---|---|---|---|---|---|---|---|
| Bộ dữ liệu bổ sung UI – màn gốc tập test | 23 | 0.0% | 0.0% | 4.3% | 17.4% | 30.4% | 4.3% |
| 30 màn tham chiếu | 30 | 0.0% | 6.7% | 3.3% | 16.7% | 13.3% | 3.3% |

## 3. Báo động giả trên cây hoàn chỉnh & độ trễ

| Tập | n | Có gợi ý thêm (ngưỡng 0.3) | ms / cây | Số ô / cây |
|---|---|---|---|---|
| Bộ dữ liệu bổ sung UI – màn gốc tập test | 23 | 69.6% | 25.5 | 18 |
| 30 màn tham chiếu | 30 | 40.0% | 26.4 | 22 |

→ analysis/eval-transformer.csv, analysis/eval-transformer.json
