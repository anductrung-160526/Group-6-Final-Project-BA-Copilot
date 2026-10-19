# Tái lập 3 bảng đánh giá của Li et al. 2020 trên dữ liệu UI web của nhóm

- Dữ liệu `data/paper-s701515`: train 1939 cây / val 420 cây / test 62 cây (277 / 60 / 62 màn gốc, chia 70/15/15 theo màn gốc, phân tầng theo nhóm màn).
- Mỗi ô: **F1** cặp cha–con (%) · **Next** phần tử kế tiếp (%) · **Edit** khoảng cách sửa cây (giây KLM). F1, Next càng cao càng tốt; Edit càng thấp càng tốt.
- Thước đo **chặt** như bài báo: khớp khi đúng loại và đúng cả 4 tọa độ khung bao. Bản **nới lỏng** (chỉ xét loại, mục 6 bài báo) để tham khảo.
- Số của bài báo đo trên Rico (điện thoại, 55 nghìn màn, lưới 72 × 128). Hai bên khác dữ liệu, khác lưới tọa độ, khác đơn vị Edit, nên **chỉ so xu hướng**, không so trực tiếp con số.

## Table 1 – Luồng thiết kế BFS

**Kết quả của nhóm – chặt (như bài báo)**

| Mô hình | BFS 10% F1 | Next | Edit | BFS 50% F1 | Next | Edit | BFS 80% F1 | Next | Edit |
|---|---|---|---|---|---|---|---|---|---|
| Pointer | 8.28 | 4.84 | 95.27 | 49.73 | 0.00 | 54.21 | 79.35 | 8.06 | 22.84 |
| Recursive | 9.17 | 6.45 | 93.71 | 43.96 | 0.00 | 53.44 | 70.08 | 6.45 | 21.87 |
| *Không gợi ý (giữ cây dở)* | 15.02 | – | 109.96 | 65.72 | – | 60.93 | 87.77 | – | 25.66 |

**Kết quả của nhóm – nới lỏng (chỉ loại)**

| Mô hình | BFS 10% F1 | Next | Edit | BFS 50% F1 | Next | Edit | BFS 80% F1 | Next | Edit |
|---|---|---|---|---|---|---|---|---|---|
| Pointer | 26.40 | 35.48 | 75.00 | 60.91 | 20.97 | 43.86 | 85.35 | 29.03 | 18.95 |
| Recursive | 27.46 | 40.32 | 68.95 | 57.81 | 19.35 | 39.08 | 78.18 | 20.97 | 13.26 |
| *Không gợi ý (giữ cây dở)* | 15.02 | – | 109.96 | 65.72 | – | 60.93 | 87.77 | – | 25.66 |

**Số trong bài báo (Rico)**

| Mô hình | BFS 10% F1 | Next | Edit | BFS 50% F1 | Next | Edit | BFS 80% F1 | Next | Edit |
|---|---|---|---|---|---|---|---|---|---|
| Pointer | 11.19 | 12.25 | 87.4 | 61.31 | 16.76 | 35.78 | 87.24 | 27.56 | 13.55 |
| Recursive | 15.23 | 18.4 | 71.26 | 64.07 | 26.84 | 46.47 | 86.41 | 36.58 | 27.22 |

## Table 2 – Luồng thiết kế DFS

**Kết quả của nhóm – chặt (như bài báo)**

| Mô hình | DFS 10% F1 | Next | Edit | DFS 50% F1 | Next | Edit | DFS 80% F1 | Next | Edit |
|---|---|---|---|---|---|---|---|---|---|
| Vanilla | 9.01 | 3.23 | 96.14 | 51.41 | 4.84 | 55.55 | 78.38 | 0.00 | 23.67 |
| Pointer | 8.83 | 8.06 | 95.01 | 50.31 | 4.84 | 54.54 | 78.44 | 6.45 | 23.05 |
| Recursive | 8.42 | 8.06 | 94.03 | 46.00 | 6.45 | 53.99 | 70.59 | 3.23 | 22.96 |
| *Không gợi ý (giữ cây dở)* | 15.02 | – | 109.96 | 65.72 | – | 60.93 | 87.77 | – | 25.66 |

**Kết quả của nhóm – nới lỏng (chỉ loại)**

| Mô hình | DFS 10% F1 | Next | Edit | DFS 50% F1 | Next | Edit | DFS 80% F1 | Next | Edit |
|---|---|---|---|---|---|---|---|---|---|
| Vanilla | 25.57 | 54.84 | 76.42 | 59.34 | 33.87 | 45.10 | 82.44 | 17.74 | 20.38 |
| Pointer | 27.29 | 61.29 | 76.25 | 59.72 | 27.42 | 43.98 | 83.64 | 27.42 | 18.49 |
| Recursive | 24.45 | 58.06 | 71.32 | 56.94 | 30.65 | 41.61 | 76.47 | 24.19 | 17.17 |
| *Không gợi ý (giữ cây dở)* | 15.02 | – | 109.96 | 65.72 | – | 60.93 | 87.77 | – | 25.66 |

**Số trong bài báo (Rico)**

| Mô hình | DFS 10% F1 | Next | Edit | DFS 50% F1 | Next | Edit | DFS 80% F1 | Next | Edit |
|---|---|---|---|---|---|---|---|---|---|
| Vanilla | 5.35 | 0.74 | 234.17 | 40.4 | 5.35 | 138.88 | 68.82 | 17.03 | 84.32 |
| Pointer | 13.12 | 20.21 | 76.44 | 65.49 | 12.03 | 21.41 | 88.96 | 22.38 | 9.13 |
| Recursive | 15.05 | 29.02 | 62.49 | 60.79 | 22.93 | 52.26 | 84.65 | 33.16 | 34.24 |

## Table 3 – Luồng BFS, thứ tự không gian ngẫu nhiên

**Kết quả của nhóm – chặt (như bài báo)**

| Mô hình | BFS 10% F1 | Next | Edit | BFS 50% F1 | Next | Edit | BFS 80% F1 | Next | Edit |
|---|---|---|---|---|---|---|---|---|---|
| Pointer | 8.34 | 4.84 | 95.84 | 46.37 | 0.00 | 53.57 | 74.27 | 0.00 | 22.83 |
| Recursive | 9.21 | 4.84 | 96.23 | 49.46 | 4.84 | 52.08 | 72.47 | 1.61 | 21.88 |
| *Không gợi ý (giữ cây dở)* | 15.02 | – | 109.96 | 65.72 | – | 60.93 | 87.77 | – | 25.66 |

**Kết quả của nhóm – nới lỏng (chỉ loại)**

| Mô hình | BFS 10% F1 | Next | Edit | BFS 50% F1 | Next | Edit | BFS 80% F1 | Next | Edit |
|---|---|---|---|---|---|---|---|---|---|
| Pointer | 27.44 | 38.71 | 76.02 | 61.08 | 37.10 | 42.49 | 80.86 | 27.42 | 17.83 |
| Recursive | 29.93 | 33.87 | 75.23 | 64.46 | 17.74 | 37.85 | 80.25 | 19.35 | 14.14 |
| *Không gợi ý (giữ cây dở)* | 15.02 | – | 109.96 | 65.72 | – | 60.93 | 87.77 | – | 25.66 |

**Số trong bài báo (Rico)**

| Mô hình | BFS 10% F1 | Next | Edit | BFS 50% F1 | Next | Edit | BFS 80% F1 | Next | Edit |
|---|---|---|---|---|---|---|---|---|---|
| Pointer | 11.19 | 12.25 | 87.4 | 61.31 | 16.76 | 35.78 | 87.24 | 27.56 | 13.55 |
| Recursive | 15.23 | 18.4 | 71.26 | 70.0 | 17.0 | 22.46 | 91.8 | 30.47 | 11.79 |

*Ghi chú:* trong bài báo, hàng Pointer của Table 3 trùng hệt Table 1; bảng trên chép đúng như bản in.

## Mô hình được chọn (theo val loss)

| Mô hình | hidden | Số lớp | Tham số | Val loss | Lưới đã dò |
|---|---|---|---|---|---|
| vanilla | 256 | 4 | 3,489,570 | 3.343 | 128×2: 3.4187, 128×4: 3.4632, 256×2: 3.3486, 256×4: 3.343 |
| pointer | 128 | 4 | 958,496 | 4.4774 | 128×2: 4.5039, 128×4: 4.4774, 256×2: 4.5514, 256×4: 4.4939 |
| recursive | 256 | 2 | 2,371,104 | 3.2045 | 128×2: 3.4193, 128×4: 3.3759, 256×2: 3.2045, 256×4: 3.3371 |
| pointer_rso | 256 | 4 | 3,554,592 | 5.1118 | 128×2: 5.1717, 128×4: 5.1154, 256×2: 5.1458, 256×4: 5.1118 |
| recursive_rso | 256 | 4 | 4,477,984 | 3.5617 | 128×2: 3.5863, 128×4: 3.6729, 256×2: 3.6027, 256×4: 3.5617 |

Tái lập: `python3 scripts/paper/reproduce_tables.py --data data/paper-s701515` (dữ liệu dựng bằng `scripts/paper/build-dataset.ts`, xem README).
