# ── Stage 1: Install dependencies ──────────────────────────────────
FROM node:22-slim AS deps

RUN corepack enable && corepack prepare pnpm@10.26.2 --activate

WORKDIR /app

# Copy workspace-level manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY turbo.json ./

# Copy only the package.json files needed by server + shared
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
COPY packages/config/package.json packages/config/

RUN pnpm install --frozen-lockfile --ignore-scripts

# ── Stage 2: Build shared packages & prepare runtime ──────────────
FROM node:22-slim AS builder

RUN corepack enable && corepack prepare pnpm@10.26.2 --activate

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules

# Copy source (tsconfig.base.json is needed by shared/config builds)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/config/ packages/config/
COPY apps/server/ apps/server/

# Build @loomic/shared (server depends on it)
RUN pnpm --filter @loomic/shared build

# ── Stage 3: Production image ─────────────────────────────────────
FROM node:22-slim AS production

WORKDIR /app

# Copy everything from builder
COPY --from=builder /app ./

# Run from apps/server so tsx and other devDeps are resolvable
WORKDIR /app/apps/server

# Container must listen on 0.0.0.0
ENV HOST=0.0.0.0
ENV NODE_ENV=production

EXPOSE 3001

# SERVICE_MODE: "api" (default) or "worker"
ENV SERVICE_MODE=api

CMD ["sh", "-c", "if [ \"$SERVICE_MODE\" = \"worker\" ]; then exec node --import tsx src/worker.ts; else exec node --import tsx src/server.ts; fi"]
