# Tái lập 3 bảng đánh giá của Li et al. 2020 trên dữ liệu UI web của nhóm

- Dữ liệu `data/paper-s701515`: train 1939 cây / val 420 cây / test 62 cây (277 / 60 / 62 màn gốc, chia 70/15/15 theo màn gốc, phân tầng theo nhóm màn).
- Mỗi ô: **F1** cặp cha–con (%) · **Next** phần tử kế tiếp (%) · **Edit** khoảng cách sửa cây (giây KLM). F1, Next càng cao càng tốt; Edit càng thấp càng tốt.
- Thước đo **chặt** như bài báo: khớp khi đúng loại và đúng cả 4 tọa độ khung bao. Bản **nới lỏng** (chỉ xét loại, mục 6 bài báo) để tham khảo.
- Số của bài báo đo trên Rico (điện thoại, 55 nghìn màn, lưới 72 × 128). Hai bên khác dữ liệu, khác lưới tọa độ, khác đơn vị Edit, nên **chỉ so xu hướng**, không so trực tiếp con số.

## Table 1 – Luồng thiết kế BFS

**Kết quả của nhóm – chặt (như bài báo)**

| Mô hình | BFS 10% F1 | Next | Edit | BFS 50% F1 | Next | Edit | BFS 80% F1 | Next | Edit |
|---|---|---|---|---|---|---|---|---|---|
| Pointer | – | – | – | – | – | – | – | – | – |
| Recursive | – | – | – | – | – | – | – | – | – |

**Kết quả của nhóm – nới lỏng (chỉ loại)**

| Mô hình | BFS 10% F1 | Next | Edit | BFS 50% F1 | Next | Edit | BFS 80% F1 | Next | Edit |
|---|---|---|---|---|---|---|---|---|---|
| Pointer | – | – | – | – | – | – | – | – | – |
| Recursive | – | – | – | – | – | – | – | – | – |

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
| Pointer | – | – | – | – | – | – | – | – | – |
| Recursive | – | – | – | – | – | – | – | – | – |
| *Không gợi ý (giữ cây dở)* | 15.02 | – | 109.96 | 65.72 | – | 60.93 | 87.77 | – | 25.66 |

**Kết quả của nhóm – nới lỏng (chỉ loại)**

| Mô hình | DFS 10% F1 | Next | Edit | DFS 50% F1 | Next | Edit | DFS 80% F1 | Next | Edit |
|---|---|---|---|---|---|---|---|---|---|
| Vanilla | 25.57 | 54.84 | 76.42 | 59.34 | 33.87 | 45.10 | 82.44 | 17.74 | 20.38 |
| Pointer | – | – | – | – | – | – | – | – | – |
| Recursive | – | – | – | – | – | – | – | – | – |
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
| Pointer | – | – | – | – | – | – | – | – | – |
| Recursive | – | – | – | – | – | – | – | – | – |

**Kết quả của nhóm – nới lỏng (chỉ loại)**

| Mô hình | BFS 10% F1 | Next | Edit | BFS 50% F1 | Next | Edit | BFS 80% F1 | Next | Edit |
|---|---|---|---|---|---|---|---|---|---|
| Pointer | – | – | – | – | – | – | – | – | – |
| Recursive | – | – | – | – | – | – | – | – | – |

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

Tái lập: `python3 scripts/paper/reproduce_tables.py --data data/paper-s701515` (dữ liệu dựng bằng `scripts/paper/build-dataset.ts`, xem README).
