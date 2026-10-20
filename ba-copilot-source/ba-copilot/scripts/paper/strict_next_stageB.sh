#!/bin/bash
# Giai đoạn B của STRICT-NEXT.md cho tổ hợp đã chọn theo val (G2W0): 500 màn, seed 43/44, Pointer, Vanilla, đường học,
# rồi chấm TEST một lần cho mọi biến thể (giai đoạn C). Dùng: bash scripts/paper/strict_next_stageB.sh
set -e
P="python3 scripts/paper/strict_next_experiment.py --threads 4"
$P --only G2W0 --roots 500                                   # dò lại 4 cấu hình trên 500 màn
CFG=$(python3 -c "import json;c=json.load(open('dataset/export/eval/strict-next/G2W0-recursive-r500-s42.json'))['chosen'];print(f\"{c['d']}:{c['layers']}\")")
echo "cấu hình chọn trên val (500 màn): $CFG"
for s in 43 44; do $P --only G2W0 --roots 500 --seed $s --grid $CFG; done
for f in 0.25 0.5; do $P --only G2W0 --roots 500 --train-frac $f --grid $CFG; done
$P --only G2W0:pointer --roots 500 --grid 128,256:2
$P --only G2W0:vanilla --roots 500 --grid 128,256:2
# giai đoạn C: test chấm một lần
$P --only G0W0,G1W0,G2W0,G0W1,G1W1,G2W1,G0W2 --roots 400 --eval-only --eval-test
$P --only G2W0,G2W0:pointer,G2W0:vanilla --roots 500 --eval-only --eval-test
for s in 43 44; do $P --only G2W0 --roots 500 --seed $s --grid $CFG --eval-only --eval-test; done
echo "XONG"
