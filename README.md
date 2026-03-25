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