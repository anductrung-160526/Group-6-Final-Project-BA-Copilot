#!/bin/bash
# Huấn luyện thẳng mô hình cuối (không so sánh biến thể), theo yêu cầu người dùng:
#   tiền huấn luyện trên WebSight (ngoài bài báo) → tinh chỉnh trên 785 màn + 2 biến thể bố cục/màn train (tăng cường, ngoài bài báo),
#   dropout 0.2; kiến trúc Recursive đúng bài báo (không embedding vị trí), hidden 256 × 4 lớp (cấu hình đã chọn theo val trước đó),
#   lưới 32 × 40 px. Chấm test 38 màn một lần. Dùng: bash scripts/paper/train_final.sh
set -e
P="python3 scripts/paper/strict_next_experiment.py --threads 4 --no-pos --grid 256:4"
O=dataset/export/eval/data-limited; mkdir -p $O
$P --data data/ws-G2 --epochs 10 --patience 3 --out $O/P-websight.json
$P --data data/sn80-G2-w7-r800-aug2 --dropout 0.2 --init data/ws-G2/models/P-websight.pt --lr 3e-4 --eval-test --test-new --out $O/final.json
echo XONG
