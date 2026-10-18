N-gram (cùng dữ liệu): 0 cây · Transformer: 478702 tham số, 153 cây

## 1. Thước đo của Li et al. 2020 (bản nới lỏng theo loại) – F1 (%), Next (%), Edit (giây KLM; chèn 5.05 s, đổi loại 3.95 s, xóa 0.10 s)

### Bộ dữ liệu bổ sung UI – màn gốc tập test – luồng BFS (Next: 22 cây, F1/Edit: 22 cây)

| Mô hình | BFS 10% F1 | Next | Next Top-3 | Edit | BFS 50% F1 | Next | Next Top-3 | Edit | BFS 80% F1 | Next | Next Top-3 | Edit |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Không gợi ý (giữ cây dở) | 13.7 | – | – | 69.6 | 65.4 | – | – | 38.6 | 87.1 | – | – | 17.0 |
| N-gram | 13.7 | 0.0 | 22.7 | 69.6 | 65.4 | 0.0 | 9.1 | 38.6 | 87.1 | 0.0 | 0.0 | 17.0 |
| Transformer | 27.3 | 50.0 | 77.3 | 46.6 | 65.4 | 40.9 | 50.0 | 27.6 | 83.4 | 27.3 | 68.2 | 12.5 |

### Bộ dữ liệu bổ sung UI – màn gốc tập test – luồng DFS (Next: 22 cây, F1/Edit: 22 cây)

| Mô hình | DFS 10% F1 | Next | Next Top-3 | Edit | DFS 50% F1 | Next | Next Top-3 | Edit | DFS 80% F1 | Next | Next Top-3 | Edit |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Không gợi ý (giữ cây dở) | 13.7 | – | – | 69.6 | 65.4 | – | – | 38.6 | 87.1 | – | – | 17.0 |
| N-gram | 13.7 | 0.0 | 0.0 | 69.6 | 65.4 | 0.0 | 4.5 | 38.6 | 87.1 | 0.0 | 4.5 | 17.0 |
| Transformer | 26.8 | 40.9 | 72.7 | 46.3 | 63.9 | 40.9 | 59.1 | 33.0 | 83.9 | 13.6 | 54.5 | 14.5 |

### 30 màn tham chiếu – luồng BFS (Next: 30 cây, F1/Edit: 30 cây)

| Mô hình | BFS 10% F1 | Next | Next Top-3 | Edit | BFS 50% F1 | Next | Next Top-3 | Edit | BFS 80% F1 | Next | Next Top-3 | Edit |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Không gợi ý (giữ cây dở) | 15.8 | – | – | 75.7 | 65.5 | – | – | 42.1 | 86.9 | – | – | 18.5 |
| N-gram | 15.8 | 0.0 | 3.3 | 75.7 | 65.5 | 3.3 | 6.7 | 42.1 | 86.9 | 0.0 | 0.0 | 18.5 |
| Transformer | 28.8 | 26.7 | 40.0 | 52.6 | 59.4 | 16.7 | 50.0 | 30.9 | 80.8 | 16.7 | 46.7 | 13.5 |

### 30 màn tham chiếu – luồng DFS (Next: 30 cây, F1/Edit: 30 cây)

| Mô hình | DFS 10% F1 | Next | Next Top-3 | Edit | DFS 50% F1 | Next | Next Top-3 | Edit | DFS 80% F1 | Next | Next Top-3 | Edit |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Không gợi ý (giữ cây dở) | 15.8 | – | – | 75.7 | 65.5 | – | – | 42.1 | 86.9 | – | – | 18.5 |
| N-gram | 15.8 | 0.0 | 3.3 | 75.7 | 65.5 | 3.3 | 10.0 | 42.1 | 86.9 | 0.0 | 3.3 | 18.5 |
| Transformer | 24.7 | 70.0 | 86.7 | 54.8 | 59.0 | 23.3 | 63.3 | 32.6 | 80.1 | 3.3 | 33.3 | 16.5 |


## 2. Tìm phần tử bị thiếu (xóa 1 node, xếp hạng mọi vị trí × loại)

| Tập | n | N-gram Hit@1 | N-gram Hit@3 | Transformer Hit@1 | Transformer Hit@3 | Đúng vị trí (Top-1) | Được gợi ý ở ngưỡng app |
|---|---|---|---|---|---|---|---|
| Bộ dữ liệu bổ sung UI – màn gốc tập test | 22 | 0.0% | 0.0% | 9.1% | 31.8% | 31.8% | 9.1% |
| 30 màn tham chiếu | 30 | 0.0% | 6.7% | 10.0% | 13.3% | 26.7% | 10.0% |

## 3. Báo động giả trên cây hoàn chỉnh & độ trễ

| Tập | n | Có gợi ý thêm (ngưỡng 0.3) | ms / cây | Số ô / cây |
|---|---|---|---|---|
| Bộ dữ liệu bổ sung UI – màn gốc tập test | 22 | 31.8% | 27.2 | 21 |
| 30 màn tham chiếu | 30 | 20.0% | 28.0 | 22 |

→ analysis/eval-transformer.csv, analysis/eval-transformer.json
