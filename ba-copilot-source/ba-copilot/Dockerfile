# BA Copilot – image chạy bản đã đóng gói sẵn (backend/dist/server.mjs + frontend/public/), không cần npm install.
# Trước khi deploy bản code mới: chạy `npm run bundle` để cập nhật backend/dist/ và frontend/public/app.js.
# Lần chạy đầu (volume /data còn trống): chép bản DB đã xuất ở backend/database/ (npm run export-db) làm dữ liệu ban đầu.
FROM node:22-slim
ENV NODE_ENV=production \
    PORT=3000 \
    DB_FILE=/data/ba-copilot.db \
    NODE_NO_WARNINGS=1
WORKDIR /app
COPY backend/dist ./backend/dist
COPY frontend/public ./frontend/public
COPY backend/model ./backend/model
COPY backend/database/ba-copilot.db ./backend/database/ba-copilot.db
COPY package.json ./
RUN mkdir -p /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "[ -f \"$DB_FILE\" ] || cp backend/database/ba-copilot.db \"$DB_FILE\"; exec node backend/dist/server.mjs"]
