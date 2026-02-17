# ── IconTale — Production Dockerfile ──────────────────────────
FROM node:20-alpine AS base

WORKDIR /app

# Install dependencies first (layer caching)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Build TypeScript
FROM base AS builder
RUN npm ci
COPY tsconfig.json ./
COPY server.ts ./
COPY lib/ ./lib/
RUN npx tsc

# Production image
FROM base AS production
COPY --from=builder /app/dist ./dist/
COPY lib/ ./lib/
COPY public/ ./public/

# Non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

ENV NODE_ENV=production
CMD ["node", "dist/server.js"]
