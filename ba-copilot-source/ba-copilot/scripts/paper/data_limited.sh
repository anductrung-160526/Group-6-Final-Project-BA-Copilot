#!/bin/bash
# Thí nghiệm "dữ liệu hạn chế" (DATA-LIMITED.md): lưới G2 (32 × 40 px), 7 độ rộng, Recursive ĐÚNG BÀI BÁO (--no-pos).
#  D0: 785 màn, không tăng cường, dropout 0.1, dò cấu hình 256 × {2,4} theo val   (đúng bài báo)
#  D1: + 2 biến thể bố cục mỗi màn train (tăng cường – ngoài bài báo), dropout 0.1
#  D2: như D1, dropout 0.3
#  P → F: tiền huấn luyện trên WebSight (ngoài bài báo) rồi tinh chỉnh trên đúng dữ liệu của D0 (so trực tiếp với D0)
# Test 38 màn chấm một lần ở cuối. Dùng: bash scripts/paper/data_limited.sh
set -e
P="python3 scripts/paper/strict_next_experiment.py --threads 4 --no-pos"
O=dataset/export/eval/data-limited; mkdir -p $O
$P --data data/sn80-G2-w7-r800-aug0 --grid 256:2,4 --out $O/D0.json
CFG=$(python3 -c "import json;c=json.load(open('$O/D0.json'))['chosen'];print(f\"{c['d']}:{c['layers']}\")"); echo "cấu hình: $CFG"
$P --data data/sn80-G2-w7-r800-aug2 --grid $CFG --out $O/D1.json
$P --data data/sn80-G2-w7-r800-aug2 --grid $CFG --dropout 0.3 --out $O/D2.json
$P --data data/ws-G2 --grid $CFG --epochs 20 --patience 3 --out $O/P-websight.json
$P --data data/sn80-G2-w7-r800-aug0 --grid $CFG --init data/ws-G2/models/P-websight.pt --lr 3e-4 --out $O/F.json
for x in D0:aug0 D1:aug2 D2:aug2 F:aug0; do n=${x%%:*}; d=${x##*:}
  $P --data data/sn80-G2-w7-r800-$d --grid $CFG --eval-only --eval-test --test-new --out $O/$n.json; done
echo XONG
