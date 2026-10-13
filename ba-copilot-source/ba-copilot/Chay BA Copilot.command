#!/bin/bash
# Nhấp đúp file này trên macOS để chạy BA Copilot (không cần npm install).
# Nếu máy chưa có Node.js >= 22.13, script tự tải Node portable chính thức từ nodejs.org vào ./.runtime
cd "$(dirname "$0")"

export PATH="$PWD/.runtime/node/bin:/opt/homebrew/bin:/usr/local/bin:$HOME/.volta/bin:$PATH"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1

node_ok() {
  command -v node >/dev/null 2>&1 || return 1
  node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)"
}

if ! node_ok; then
  echo "Chưa có Node.js >= 22.13 – đang tải Node.js 22 portable từ nodejs.org…"
  ARCH=$(uname -m); [ "$ARCH" = "x86_64" ] && ARCH="x64"
  BASE="https://nodejs.org/dist/latest-v22.x"
  SUMS=$(curl -fsSL "$BASE/SHASUMS256.txt") || { echo "Không tải được danh sách phiên bản. Kiểm tra mạng."; read -r; exit 1; }
  LINE=$(echo "$SUMS" | grep " node-v.*-darwin-$ARCH.tar.gz$")
  FILE=$(echo "$LINE" | awk '{print $2}'); SUM=$(echo "$LINE" | awk '{print $1}')
  [ -n "$FILE" ] || { echo "Không tìm thấy bản Node cho darwin-$ARCH"; read -r; exit 1; }
  mkdir -p .runtime && curl -fL --progress-bar -o ".runtime/$FILE" "$BASE/$FILE" || { echo "Tải thất bại."; read -r; exit 1; }
  echo "$SUM  .runtime/$FILE" | shasum -a 256 -c - || { echo "Sai checksum – dừng lại."; read -r; exit 1; }
  tar -xzf ".runtime/$FILE" -C .runtime && mv ".runtime/${FILE%.tar.gz}" .runtime/node && rm -f ".runtime/$FILE"
fi
node_ok || { echo "Không chuẩn bị được Node.js."; read -r; exit 1; }
echo "Node.js $(node -v)"

[ -f .env ] || cp .env.example .env
PORT=$(grep -E '^PORT=' .env | cut -d= -f2); PORT=${PORT:-3000}
if lsof -i ":$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Cổng $PORT đang được dùng – có thể BA Copilot đã chạy rồi. Mở trình duyệt…"
  open "http://localhost:$PORT"; exit 0
fi
(sleep 2 && open "http://localhost:$PORT") &
echo "Đang chạy BA Copilot – giữ cửa sổ này mở. Nhấn Ctrl+C để dừng."
NODE_NO_WARNINGS=1 node dist/server.mjs
