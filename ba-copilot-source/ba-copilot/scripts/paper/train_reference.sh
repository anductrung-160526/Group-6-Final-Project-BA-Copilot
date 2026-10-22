#!/bin/bash
# Huấn luyện hai mô hình tham chiếu của Li et al. 2020 – Pointer (§4.3) và Vanilla (§4.2) – theo đúng quy trình của mô hình Recursive
# trong app (train_final.sh): tiền huấn luyện trên WebSight (data/ws-G2) → tinh chỉnh trên 785 màn + tăng cường
# (data/sn80-G2-w7-r800-aug2), hidden 256 × 4 lớp, lưới 32 × 40 px, không embedding vị trí; chấm test rồi xuất bảng 1–3.
# Dùng: bash scripts/paper/train_reference.sh        (chạy từ ba-copilot-source/ba-copilot; cần data/ws-G2 và data/sn80-G2-w7-r800-aug2)
set -e
P="python3 scripts/paper/strict_next_experiment.py --threads ${THREADS:-4} --no-pos --grid 256:4"
WS=data/ws-G2
FT=data/sn80-G2-w7-r800-aug2
L=dataset/export/eval/transformer/train-logs; mkdir -p $L
for K in pointer vanilla; do
  DROP=$([ $K = pointer ] && echo "--dropout 0.2" || echo "")
  $P --kind $K --data $WS --epochs 10 --patience 3 $DROP --out $L/$K-websight.json
  $P --kind $K --data $FT $DROP --init $WS/models/$K-websight.pt --lr 3e-4 --eval-test --out $L/$K-final.json
  python3 scripts/paper/eval_app_model.py --data $FT --kind $K --weights $FT/models/$K-final.pt --out dataset/export/eval/transformer/$K.json
done
echo XONG
