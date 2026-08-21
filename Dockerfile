# syntax=docker/dockerfile:1.7

FROM node:22.23.2-alpine3.23@sha256:46825fbbd4e996a78b7a2cdc08d75e38a5a505bdab95dcda55605359bf124bc6 AS builder

WORKDIR /app

# Puppeteer 仅用于仓库测试；生产前端构建不需要下载浏览器。
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    API_KEY="" \
    GEMINI_API_KEY="" \
    OPENAI_API_KEY="" \
    OPENAI_BASE_URL="" \
    OPENAI_MODEL="" \
    AI_BACKEND_URL="" \
    VITE_API_KEY="" \
    VITE_GEMINI_API_KEY="" \
    VITE_OPENAI_API_KEY="" \
    VITE_OPENAI_BASE_URL="" \
    VITE_OPENAI_MODEL="" \
    VITE_AI_BACKEND_URL=""

COPY package.json package-lock.json ./
COPY packages ./packages
COPY patches ./patches

RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

COPY . .

# 第一阶段不把任何 AI 凭据或后端地址编译进静态资源。
RUN test -z "${API_KEY}${GEMINI_API_KEY}${OPENAI_API_KEY}${AI_BACKEND_URL}" \
    && test -z "${VITE_API_KEY}${VITE_GEMINI_API_KEY}${VITE_OPENAI_API_KEY}" \
    && test -z "${VITE_AI_BACKEND_URL}" \
    && NODE_OPTIONS=--max-old-space-size=4096 npm run build

FROM nginxinc/nginx-unprivileged:1.29.4-alpine@sha256:a6c4f61f456b85b8fdf7ec7ab28cc3e299440e6fb4a9dea520e5fd8fd440025e AS runtime

COPY deploy/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 8443

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider --no-check-certificate \
    https://127.0.0.1:8443/healthz || exit 1
