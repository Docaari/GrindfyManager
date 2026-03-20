# === Stage 1: Build ===
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY client/ ./client/
COPY server/ ./server/
COPY shared/ ./shared/
COPY attached_assets/ ./attached_assets/
COPY vite.config.ts tsconfig.json tailwind.config.ts postcss.config.js components.json ./

RUN npm run build
RUN npm prune --production

# === Stage 2: Runtime ===
FROM node:20-alpine AS runtime
WORKDIR /app

RUN addgroup -g 1001 appgroup && \
    adduser -u 1001 -G appgroup -s /bin/sh -D appuser

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "dist/index.js"]
