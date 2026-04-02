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

# Python runtime for sandbox code execution (canvas-design skill)
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 python3-pip && \
    pip3 install --no-cache-dir --break-system-packages pillow reportlab && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Copy skills (fonts + SKILL.md) to /opt/loomic/skills/
COPY skills/ /opt/loomic/skills/

# SERVICE_MODE: "api" (default) or "worker"
ENV SERVICE_MODE=api

# Write Google service account JSON from env var to file (for Vertex AI auth in cloud).
# Set GOOGLE_SERVICE_ACCOUNT_JSON in Railway/cloud env vars with the full JSON content.
CMD ["sh", "-c", "\
  if [ -n \"$GOOGLE_SERVICE_ACCOUNT_JSON\" ]; then \
    mkdir -p /app/apps/server/credentials && \
    echo \"$GOOGLE_SERVICE_ACCOUNT_JSON\" > /app/apps/server/credentials/vertex-ai-service-account.json && \
    export GOOGLE_APPLICATION_CREDENTIALS=/app/apps/server/credentials/vertex-ai-service-account.json; \
  fi && \
  if [ \"$SERVICE_MODE\" = \"worker\" ]; then \
    exec node --import tsx src/worker.ts; \
  else \
    exec node --import tsx src/server.ts; \
  fi"]
