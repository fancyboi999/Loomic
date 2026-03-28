# Loomic

AI-powered creative workspace.

## Tech Stack

- **Monorepo**: Turborepo + pnpm
- **Web**: Next.js 15 (App Router) + React 19 + Tailwind CSS 4
- **Server**: Node.js + Fastify
- **Worker**: Node.js (poll-based task queue consumer)
- **Database**: Supabase (PostgreSQL + Auth + Storage)
- **Canvas**: Excalidraw
- **AI**: OpenAI / Anthropic (image generation, chat)

## Getting Started

### Prerequisites

- Node.js >= 20
- pnpm >= 9

### Install

```bash
pnpm install
```

### Environment

Copy `.env.local.example` to `.env.local` in each app and fill in your values:

```bash
cp apps/web/.env.local.example apps/web/.env.local
cp apps/server/.env.local.example apps/server/.env.local
```

| File | Required Variables |
|------|-------------------|
| `apps/web/.env.local` | Supabase URL/Key, Server URL |
| `apps/server/.env.local` | Supabase credentials, OpenAI API Key, Google Fonts API Key |

**Google Fonts API Key** (brand kit font picker 需要):
1. 前往 [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. 创建 API Key
3. 启用 "Web Fonts Developer API"
4. 填入 `apps/server/.env.local` 的 `GOOGLE_FONTS_API_KEY`

### Development

Start all services (web + server + worker):

```bash
pnpm dev
```

| Service | Port | Description |
|---------|------|-------------|
| Web     | 3000 | Next.js frontend |
| Server  | 3001 | Fastify API server |
| Worker  | —    | Background task processor (image generation etc.) |

#### Worker 启动模式

默认 `pnpm dev` 启动 1 个 server + 1 个 worker。每个 worker 默认并发处理 3 个 job。

如需更高吞吐，可启动多个 worker 实例（PGMQ 原子读取保证不会重复消费）：

```bash
# 1 server + 1 worker（默认，并发 3 job）
pnpm dev

# 仅启动 worker（可在多个终端分别运行）
pnpm --filter @loomic/server dev:worker

# 快捷启动多 worker 实例
pnpm --filter @loomic/server dev:workers:2   # 2 worker（并发 6 job）
pnpm --filter @loomic/server dev:workers:3   # 3 worker（并发 9 job）
```

Worker 环境变量：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `WORKER_CONCURRENCY` | `3` | 单个 worker 实例并发处理的 job 数 |
| `WORKER_ID` | 随机 8 位 | worker 实例标识，用于日志区分 |
| `WORKER_POLL_INTERVAL_MS` | `2000` | 轮询队列间隔（毫秒） |

### Build

```bash
npx turbo run build
```

### Test

```bash
npx turbo run test
```

## Project Structure

```
apps/
  web/        — Next.js frontend
  server/     — Fastify API server + background worker
packages/
  shared/     — Shared types and utilities
```