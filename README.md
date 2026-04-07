# NexDeal — Docker + Neon Database Setup Guide

A complete guide for running **NexDeal** locally with **Neon Local** (ephemeral
branches) and deploying to production with **Neon Cloud**.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Environment Variables](#environment-variables)
4. [Development — Local with Neon Local](#development--local-with-neon-local)
5. [Production — Neon Cloud](#production--neon-cloud)
6. [How DATABASE_URL switches between environments](#how-database_url-switches-between-environments)
7. [Useful Commands](#useful-commands)
8. [File Reference](#file-reference)

---

## Architecture Overview

```
┌─────────────────────── docker-compose.dev.yml ─────────────────────────┐
│                                                                          │
│  ┌──────────────────┐    postgres://neon:npg@neon-local:5432/neondb      │
│  │   nexdeal-app    │──────────────────────────────────────────────────► │
│  │  (Node.js API)   │                                                    │
│  └──────────────────┘    http://neon-local:5432/sql  (Neon serverless)  │
│             │                                                            │
│             ▼                                                            │
│  ┌──────────────────┐                                                    │
│  │   neon-local     │──► Neon Cloud API (creates ephemeral branch)      │
│  │  (proxy/broker)  │                                                    │
│  └──────────────────┘                                                    │
└──────────────────────────────────────────────────────────────────────────┘

┌─────────────────────── docker-compose.prod.yml ────────────────────────┐
│                                                                          │
│  ┌──────────────────┐    DATABASE_URL → neon.tech (TLS/SSL)             │
│  │   nexdeal-app    │──────────────────────────────────────────────────► Neon Cloud
│  │  (Node.js API)   │                                                    │
│  └──────────────────┘                                                    │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Prerequisites

| Tool           | Version | Notes                                                                    |
| -------------- | ------- | ------------------------------------------------------------------------ |
| Docker Desktop | ≥ 24    | [Download](https://www.docker.com/products/docker-desktop/)              |
| Node.js        | ≥ 20    | Only needed for bare-metal dev                                           |
| Neon account   | —       | [Sign up free](https://console.neon.tech/signup)                         |
| Neon API Key   | —       | **Manage → API Keys** in the Neon console                                |
| Arcjet account | —       | [arcjet.com](https://arcjet.com) (optional — skip key for local testing) |

---

## Environment Variables

Copy the example file and fill in your values:

```bash
cp .env.example .env.development   # for local dev
cp .env.example .env.production    # for production
```

| Variable           | Used in  | Description                                          |
| ------------------ | -------- | ---------------------------------------------------- |
| `DATABASE_URL`     | Both     | Postgres connection string                           |
| `NEON_API_KEY`     | Dev only | Neon API key (used by Neon Local proxy)              |
| `NEON_PROJECT_ID`  | Dev only | Your Neon project ID                                 |
| `PARENT_BRANCH_ID` | Dev only | Branch to fork ephemeral branches from (e.g. `main`) |
| `NEON_LOCAL_HOST`  | Dev only | Override host for Neon Local (default: `neon-local`) |
| `ARCJET_KEY`       | Both     | Arcjet security key                                  |
| `PORT`             | Both     | HTTP port the app listens on (default: `3000`)       |
| `NODE_ENV`         | Both     | `development` or `production`                        |
| `LOG_LEVEL`        | Both     | `debug` / `info` / `warn` / `error`                  |

---

## Development — Local with Neon Local

### 1. Fill in `.env.development`

```dotenv
NEON_API_KEY=your_neon_api_key
NEON_PROJECT_ID=your_neon_project_id
PARENT_BRANCH_ID=br-your-main-branch-id   # get from Neon console → Branches
DATABASE_URL=postgres://neon:npg@neon-local:5432/neondb
ARCJET_KEY=your_arcjet_key
```

> **Finding your IDs**  
> In the Neon Console, open your project.
>
> - **Project ID** — visible on the Project Settings page
> - **Branch ID** — go to **Branches**, click on `main`, copy the ID from the URL

### 2. Start the stack

```bash
docker compose -f docker-compose.dev.yml --env-file .env.development up --build
```

What happens:

1. The **`neon-local`** container starts and calls the Neon API to create a
   fresh **ephemeral child branch** forked from your `PARENT_BRANCH_ID`.
2. The **`app`** container waits for `neon-local` to become healthy, then
   starts with `node --watch` (live-reload on file saves).
3. Your app connects to Postgres at `postgres://neon:npg@neon-local:5432/neondb`.
4. When you `docker compose down`, Neon Local **deletes** the ephemeral branch
   automatically — no orphaned branches accumulate.

### 3. Access the API

```
http://localhost:3000/
http://localhost:3000/health
http://localhost:3000/api
```

### 4. Run Drizzle migrations (against the ephemeral dev branch)

```bash
# In a new terminal — target Neon Local which is now exposed on localhost:5432
DATABASE_URL=postgres://neon:npg@localhost:5432/neondb npx drizzle-kit migrate
```

Or open Drizzle Studio:

```bash
DATABASE_URL=postgres://neon:npg@localhost:5432/neondb npx drizzle-kit studio
```

### 5. Stop the stack

```bash
docker compose -f docker-compose.dev.yml --env-file .env.development down
```

The ephemeral Neon branch is deleted automatically.

---

## Production — Neon Cloud

### 1. Fill in `.env.production`

```dotenv
NODE_ENV=production
DATABASE_URL=postgres://neondb_owner:<password>@<host>.neon.tech/neondb?sslmode=require&channel_binding=require
ARCJET_KEY=your_production_arcjet_key
```

> **Never commit `.env.production`** — it is in `.gitignore`.  
> In CI/CD (GitHub Actions, Railway, Fly.io, etc.) inject these as **Secrets**.

### 2. Build the production image

```bash
docker build -t nexdeal:latest .
```

### 3. Run with Neon Cloud

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
```

No Neon Local proxy runs in production. The app connects directly to Neon Cloud
over TLS/SSL.

### 4. Push to a registry (for CI/CD)

```bash
docker tag nexdeal:latest your-registry/nexdeal:latest
docker push your-registry/nexdeal:latest
```

---

## How `DATABASE_URL` switches between environments

| Environment     | `DATABASE_URL`                                | `NODE_ENV`    | Neon serverless driver config      |
| --------------- | --------------------------------------------- | ------------- | ---------------------------------- |
| **Development** | `postgres://neon:npg@neon-local:5432/neondb`  | `development` | `fetchEndpoint` → Neon Local proxy |
| **Production**  | `postgres://...neon.tech/...?sslmode=require` | `production`  | Default (direct, secure WebSocket) |

The switch happens in `src/config/database.js`:

```js
if (process.env.NODE_ENV === 'development') {
  const neonLocalHost = process.env.NEON_LOCAL_HOST ?? 'neon-local';
  neonConfig.fetchEndpoint = `http://${neonLocalHost}:5432/sql`;
  neonConfig.useSecureWebSocket = false;
  neonConfig.poolQueryViaFetch = true;
}
```

In production `NODE_ENV=production`, so the `if` block is skipped and the
driver connects normally to Neon Cloud.

---

## Useful Commands

```bash
# ── Development ────────────────────────────────────────────────────────────
# Start (build + up)
docker compose -f docker-compose.dev.yml --env-file .env.development up --build

# Start in background
docker compose -f docker-compose.dev.yml --env-file .env.development up -d --build

# Follow logs
docker compose -f docker-compose.dev.yml logs -f

# Stop and remove containers (ephemeral Neon branch is deleted)
docker compose -f docker-compose.dev.yml --env-file .env.development down

# ── Production ─────────────────────────────────────────────────────────────
# Build image
docker build -t nexdeal:latest .

# Start (detached)
docker compose -f docker-compose.prod.yml --env-file .env.production up -d

# Stop
docker compose -f docker-compose.prod.yml down
```

---

## File Reference

```
NexDeal/
├── Dockerfile                  # Multi-stage: deps → builder → runner
├── .dockerignore               # Excludes node_modules, .env files, logs from build context
├── docker-compose.dev.yml      # Dev: app + Neon Local proxy (ephemeral branches)
├── docker-compose.prod.yml     # Prod: app only, connects directly to Neon Cloud
├── .env.development            # Local dev secrets (gitignored)
├── .env.production             # Production secrets (gitignored)
├── .env.example                # Committed template — shows all required variables
├── .gitignore                  # Includes .env.*, .neon_local/
└── src/
    └── config/
        └── database.js         # Neon serverless driver — dev/prod routing logic
```
