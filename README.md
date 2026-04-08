# NexDeal

A Node.js backend API built with Express, Drizzle ORM, and Neon Database.

---

## Table of Contents

1. [How This Project Works (Big Picture)](#how-this-project-works-big-picture)
2. [Prerequisites](#prerequisites)
3. [Environment Variables](#environment-variables)
4. [Development Workflow](#development-workflow)
5. [CI/CD Pipeline (GitHub Actions)](#cicd-pipeline-github-actions)
6. [Production Deployment](#production-deployment)
7. [Understanding "localhost:3000"](#understanding-localhost3000)
8. [File Reference](#file-reference)
9. [Future Improvements](#future-improvements)

---

## How This Project Works (Big Picture)

This project has three main environments: **development**, **CI/CD**, and **production**.
Here's how they connect:

```
  YOU (Developer)
    │
    ├── Write code locally
    │
    ├── Run dev environment ──► Docker Compose (dev) ──► Neon Local DB
    │                            (hot reload enabled)
    │
    ├── Push to GitHub (main branch)
    │         │
    │         ▼
    │    GitHub Actions (CI)
    │         │
    │         ├── Lint & Format check
    │         ├── Run tests (Jest)
    │         └── Build Docker image ──► Push to Docker Hub
    │                                     (tagged: latest, sha, timestamp)
    │
    └── On your server (production)
          │
          └── Run prod.sh ──► Docker Compose (prod) ──► Neon Cloud DB
                               (optimized, no hot reload)
```

### What each piece does:

| Component                    | Purpose                                                 |
| ---------------------------- | ------------------------------------------------------- |
| **Dockerfile**               | Builds the app into a Docker image (multi-stage build)  |
| **docker-compose.dev.yml**   | Runs app + Neon Local proxy for development             |
| **docker-compose.prod.yml**  | Runs app only, connects to Neon Cloud for production    |
| **GitHub Actions**           | Automatically builds & pushes Docker image on every push to `main` |
| **scripts/prod.sh**          | Helper script to start the production environment       |
| **scripts/dev.sh**           | Helper script to start the development environment      |

---

## Prerequisites

| Tool           | Version | Notes                                                                    |
| -------------- | ------- | ------------------------------------------------------------------------ |
| Docker Desktop | ≥ 24    | [Download](https://www.docker.com/products/docker-desktop/)              |
| Node.js        | ≥ 20    | Only needed if running outside Docker                                    |
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

> **⚠️ Never commit `.env.development` or `.env.production`** — they are in `.gitignore`.
> In CI/CD, inject these as **Secrets** (see the GitHub Actions section below).

---

## Development Workflow

This is what you use day-to-day while writing code.

### Quick Start

```bash
# Option 1: Use the helper script
npm run dev:docker

# Option 2: Run Docker Compose directly
docker compose -f docker-compose.dev.yml --env-file .env.development up --build
```

### What happens when you start dev:

1. **Neon Local proxy** starts — it calls the Neon API and creates a temporary (ephemeral) database branch forked from your main branch
2. **Your app** waits for the database to be healthy, then starts with `node --watch` (automatic restart on file changes — no need for nodemon)
3. Your code changes are **live-reloaded** — save a file, the app restarts automatically
4. When you stop the containers, the ephemeral database branch is **automatically deleted**

### Access the app

```
http://localhost:3000/
http://localhost:3000/health
http://localhost:3000/api
```

### Run database migrations

```bash
# In a new terminal — target Neon Local which is exposed on localhost:5432
DATABASE_URL=postgres://neon:npg@localhost:5432/neondb npx drizzle-kit migrate
```

Open Drizzle Studio (visual database browser):

```bash
DATABASE_URL=postgres://neon:npg@localhost:5432/neondb npx drizzle-kit studio
```

### Stop the dev environment

```bash
docker compose -f docker-compose.dev.yml --env-file .env.development down
```

The ephemeral Neon branch is deleted automatically — no orphaned branches pile up.

---

## CI/CD Pipeline (GitHub Actions)

This is the **automated** part. You don't run this manually — GitHub does it for you.

### What triggers it?

Every **push to the `main` branch** (or manual trigger via `workflow_dispatch`).

### What happens step by step:

```
Push to main
    │
    ▼
┌─────────────────────────────────────────────────────┐
│  1. Lint & Format (lint-and-format.yml)              │
│     • Runs ESLint to check code quality              │
│     • Runs Prettier to check formatting              │
│     • Fails the build if issues are found            │
├─────────────────────────────────────────────────────┤
│  2. Tests (tests.yml)                                │
│     • Installs dependencies                          │
│     • Runs Jest test suite with coverage             │
│     • Uploads coverage report as artifact            │
├─────────────────────────────────────────────────────┤
│  3. Docker Build & Push (docker-build-and-push.yml)  │
│     • Sets up Docker Buildx (multi-platform)         │
│     • Logs in to Docker Hub                          │
│     • Builds the production Docker image             │
│     • Pushes to Docker Hub with multiple tags        │
└─────────────────────────────────────────────────────┘
```

### How the Docker image is tagged:

| Tag format                     | Example                          | Purpose                           |
| ------------------------------ | -------------------------------- | --------------------------------- |
| `latest`                       | `latest`                         | Always points to the newest build |
| `main`                         | `main`                           | Branch name tag                   |
| `sha-<full commit hash>`      | `sha-abc123def456...`            | Exact commit traceability         |
| `sha-<short commit hash>`     | `sha-abc123d`                    | Shorter commit reference          |
| `prod-YYYYMMDD-HHmmss`        | `prod-20260408-120000`           | Timestamp-based, great for rollbacks |

### GitHub Secrets required:

You must add these secrets in your GitHub repo (**Settings → Secrets and variables → Actions**):

| Secret             | Value                          |
| ------------------ | ------------------------------ |
| `DOCKER_USERNAME`  | Your Docker Hub username       |
| `DOCKER_PASSWORD`  | Your Docker Hub access token   |
| `DATABASE_URL`     | A dummy or test DB URL for CI  |

### Important: No auto-deployment yet

After the image is pushed to Docker Hub, **nothing else happens automatically**.
You still need to manually SSH into your server and run the production script (see next section).

---

## Production Deployment

This is how you run the app on your actual server (VPS, cloud VM, etc.).

### 1. Set up `.env.production` on your server

```dotenv
NODE_ENV=production
DATABASE_URL=postgres://neondb_owner:<password>@<host>.neon.tech/neondb?sslmode=require&channel_binding=require
ARCJET_KEY=your_production_arcjet_key
```

> Get the `DATABASE_URL` from the **Neon Console → Connection Details** page.

### 2. Run the production script

```bash
# Option 1: Use the helper script
npm run prod:docker

# Option 2: Run Docker Compose directly
docker compose -f docker-compose.prod.yml --env-file .env.production up --build -d
```

### What `prod.sh` does:

1. Checks that `.env.production` exists
2. Checks that Docker is running
3. Runs `docker compose -f docker-compose.prod.yml up --build -d` (builds and starts in background)
4. Runs database migrations via `npm run db:migrate`
5. Prints the app URL and useful commands

### Key differences from development:

| Feature              | Development                       | Production                           |
| -------------------- | --------------------------------- | ------------------------------------ |
| Database             | Neon Local (ephemeral branch)     | Neon Cloud (persistent, TLS/SSL)     |
| Hot reload           | ✅ Yes (`node --watch`)           | ❌ No (optimized `node src/index.js`) |
| Docker Compose file  | `docker-compose.dev.yml`          | `docker-compose.prod.yml`            |
| Containers           | App + Neon Local proxy            | App only                             |
| Resource limits      | None                              | 512MB RAM, 0.5 CPU                   |
| Source code mounted   | ✅ Yes (live edits)               | ❌ No (baked into image)             |

### Useful production commands

```bash
# View logs
docker logs -f nexdeal-app-prod

# Stop the app
docker compose -f docker-compose.prod.yml down

# Restart with fresh build
docker compose -f docker-compose.prod.yml up --build -d
```

---

## Understanding "localhost:3000"

This is a common point of confusion, so let's clear it up.

### What `localhost:3000` actually means

When the app says it's running on `http://localhost:3000`, that means:

- The app is listening on **port 3000 inside the Docker container**
- Docker maps that port to **port 3000 on the host machine** (your server or laptop)
- If you're on the same machine, you can open `http://localhost:3000` in your browser

### But… how do users on the internet access it?

`localhost` only works on the machine itself. **People on the internet cannot reach `localhost:3000`.**

To make your app publicly accessible, you need one of these:

```
Internet Users
     │
     ▼
┌────────────────────────────┐
│  Option A: Reverse Proxy   │
│  (Nginx / Caddy / Traefik) │
│                            │
│  yourdomain.com:443 (HTTPS)│
│       │                    │
│       ▼                    │
│  localhost:3000 (your app)  │
└────────────────────────────┘

┌────────────────────────────┐
│  Option B: Cloud Provider   │
│  (AWS ALB / GCP LB / etc.) │
│                            │
│  Load Balancer → Your Server│
│       │                    │
│       ▼                    │
│  localhost:3000 (your app)  │
└────────────────────────────┘
```

### Docker port mapping (you already have this)

In `docker-compose.prod.yml`, the port mapping `'3000:3000'` means:

```
Host port 3000  →  Container port 3000
```

This is Docker's way of connecting the container's internal network to the host machine's network. Without this mapping, even you couldn't access the app from the host — the container would be completely isolated.

### Setting up a reverse proxy (example with Nginx)

Here's a minimal Nginx config to forward traffic to your Docker container:

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

> **Note:** Infrastructure setup (Nginx, domain, SSL certificates) is handled separately and
> is **not part of this repository**. This repo only contains the application code.

---

## File Reference

```
NexDeal/
├── Dockerfile                          # Multi-stage build: deps → builder → production
├── .dockerignore                       # Keeps Docker build context clean
│
├── docker-compose.dev.yml              # Dev: app + Neon Local proxy (ephemeral DB)
├── docker-compose.prod.yml             # Prod: app only → Neon Cloud (persistent DB)
│
├── scripts/
│   ├── dev.sh                          # Helper script to start dev environment
│   └── prod.sh                         # Helper script to start prod environment
│
├── .github/workflows/
│   ├── docker-build-and-push.yml       # CI: Build image → push to Docker Hub
│   ├── lint-and-format.yml             # CI: ESLint + Prettier checks
│   └── tests.yml                       # CI: Jest test suite + coverage
│
├── .env.example                        # Template — all required variables
├── .env.development                    # Your local dev secrets (gitignored)
├── .env.production                     # Your production secrets (gitignored)
│
├── src/
│   ├── index.js                        # App entry point
│   └── config/
│       └── database.js                 # Neon driver — auto-switches dev/prod
│
├── drizzle/                            # Database migrations
├── drizzle.config.js                   # Drizzle ORM config
├── package.json                        # Dependencies and scripts
└── eslint.config.js                    # ESLint configuration
```

---

## Future Improvements

These are things you can add later as the project grows:

### Auto-deployment after image push

Currently, after GitHub Actions pushes the image to Docker Hub, you have to manually deploy.
You could automate this by:

```yaml
# Add a step at the end of docker-build-and-push.yml:
- name: Deploy to production server
  uses: appleboy/ssh-action@v1
  with:
    host: ${{ secrets.SERVER_HOST }}
    username: ${{ secrets.SERVER_USER }}
    key: ${{ secrets.SERVER_SSH_KEY }}
    script: |
      cd /path/to/NexDeal
      docker compose -f docker-compose.prod.yml pull
      docker compose -f docker-compose.prod.yml up -d
```

### Other options to explore

- **Kubernetes** — For scaling to multiple instances with auto-healing
- **Docker Swarm** — Simpler alternative to Kubernetes for small teams
- **Cloud platforms** — AWS ECS, Google Cloud Run, Fly.io, Railway (they handle infrastructure for you)
- **Watchtower** — Auto-pulls and restarts containers when a new image is pushed to Docker Hub

---

## Quick Reference

```bash
# ── Development ─────────────────────────────────────────────────────
npm run dev:docker                              # Start dev (uses dev.sh)

docker compose -f docker-compose.dev.yml \
  --env-file .env.development up --build        # Or run directly

docker compose -f docker-compose.dev.yml \
  --env-file .env.development down              # Stop dev

# ── Production ──────────────────────────────────────────────────────
npm run prod:docker                             # Start prod (uses prod.sh)

docker compose -f docker-compose.prod.yml \
  --env-file .env.production up --build -d      # Or run directly

docker compose -f docker-compose.prod.yml down  # Stop prod

docker logs -f nexdeal-app-prod                 # View logs

# ── Database ────────────────────────────────────────────────────────
npm run db:migrate                              # Run migrations
npm run db:studio                               # Open Drizzle Studio
npm run db:generate                             # Generate migration files
```
