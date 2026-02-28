# ---- ビルドステージ ----
FROM node:20-alpine AS builder

WORKDIR /app

# 依存関係インストール
COPY package*.json ./
RUN npm ci

# ソースコードコピー
COPY . .

# Vite 本番ビルド → dist に出力
RUN npm run build

# ---- 実行ステージ（Nginx）----
FROM nginx:alpine

# SPA 用設定
COPY nginx.conf /etc/nginx/conf.d/default.conf

# ビルド成果物を配信ディレクトリへ
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]