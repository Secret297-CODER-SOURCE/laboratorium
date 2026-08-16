# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache python3 make g++ libstdc++

# --- dependencies (native modules: better-sqlite3) ---
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# --- production image ---
FROM node:22-alpine AS runner
WORKDIR /app

ARG STATIC_VERSION=

RUN apk add --no-cache libstdc++ \
  && addgroup -g 1001 -S lab \
  && adduser -S lab -u 1001 -G lab

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY server ./server
COPY public ./public

RUN mkdir -p /app/data/uploads/recordings /app/data/uploads/chat \
  && chown -R lab:lab /app

USER lab

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    STATIC_VERSION=${STATIC_VERSION} \
    DATABASE_PATH=/app/data/laboratorium.db \
    UPLOADS_DIR=/app/data/uploads \
    RECORDINGS_DIR=/app/data/uploads/recordings \
    CHAT_UPLOADS_DIR=/app/data/uploads/chat \
    SEED_DATABASE=true

EXPOSE 3000

VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
