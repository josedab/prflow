---
sidebar_position: 1
title: Installation
description: Install PRFlow as a GitHub Action or self-hosted service
---

# Installation

PRFlow works in two modes: as a **GitHub Action** (zero infrastructure) or **self-hosted** (full control).

## GitHub Action (Recommended)

The fastest path to automated PR reviews. No servers, no setup, no maintenance.

### Step 1: Add the Workflow

Create `.github/workflows/prflow.yml` in your repository:

```yaml title=".github/workflows/prflow.yml"
name: PRFlow

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  prflow:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
      checks: write
    
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Full history for better analysis
      
      - uses: prflow/action@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Step 2: Commit and Push

```bash
git add .github/workflows/prflow.yml
git commit -m "ci: add PRFlow automation"
git push
```

### Step 3: Open a PR

Create any pull request. PRFlow will automatically:
1. Analyze the changes
2. Post review comments
3. Suggest tests for new code
4. Report a check status

**That's it.** You're done.

---

## Self-Hosted Installation

For teams that need:
- Data residency control
- Custom LLM providers
- On-premise deployment
- Advanced integrations

### Prerequisites

| Requirement | Version |
|-------------|---------|
| Node.js | 20+ |
| pnpm | 9+ |
| Docker | 20+ |
| PostgreSQL | 14+ |
| Redis | 7+ |

### Quick Start with Docker

```bash
# Clone the repository
git clone https://github.com/josedab/prflow.git
cd prflow

# Copy environment template
cp .env.example .env

# Start all services (PostgreSQL, Redis, API, Web)
docker compose -f docker/docker-compose.yml up -d

# Check status
docker compose -f docker/docker-compose.yml ps
```

PRFlow is now running at `http://localhost:3001`.

### Manual Installation

For more control over each component:

#### 1. Clone and Install Dependencies

```bash
git clone https://github.com/josedab/prflow.git
cd prflow
pnpm install
```

#### 2. Start Database and Cache

```bash
# PostgreSQL
docker run -d \
  --name prflow-postgres \
  -e POSTGRES_USER=prflow \
  -e POSTGRES_PASSWORD=prflow \
  -e POSTGRES_DB=prflow \
  -p 5432:5432 \
  postgres:15-alpine

# Redis
docker run -d \
  --name prflow-redis \
  -p 6379:6379 \
  redis:7-alpine
```

#### 3. Configure Environment

```bash title=".env"
# Application
NODE_ENV=production
PORT=3001
LOG_LEVEL=info

# Database
DATABASE_URL=postgresql://prflow:prflow@localhost:5432/prflow

# Redis
REDIS_URL=redis://localhost:6379

# GitHub App (required for webhooks)
GITHUB_APP_ID=your-app-id
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
GITHUB_WEBHOOK_SECRET=your-webhook-secret

# OAuth (optional, for web dashboard)
GITHUB_CLIENT_ID=Iv1.xxxxxxxx
GITHUB_CLIENT_SECRET=xxxxxxxx

# Session
SESSION_SECRET=generate-a-32-char-random-string

# LLM (optional, enhances analysis)
OPENAI_API_KEY=sk-...
```

#### 4. Initialize Database

```bash
# Generate Prisma client
pnpm db:generate

# Run migrations
pnpm db:migrate
```

#### 5. Build and Start

```bash
# Build all packages
pnpm build

# Start API server
pnpm --filter @prflow/api start

# Start web dashboard (optional)
pnpm --filter @prflow/web start
```

---

## Verify Installation

### GitHub Action

Open a PR in your repository. You should see:
- A "PRFlow" check appear within seconds
- Review comments on files with issues
- A summary comment on the PR

### Self-Hosted

```bash
# Health check
curl http://localhost:3001/api/health
# Expected: {"status":"ok","version":"0.1.0"}

# Readiness check
curl http://localhost:3001/api/health/ready
# Expected: {"status":"ready","database":"connected","redis":"connected"}
```

---

## Next Steps

- [**Quick Start**](/docs/getting-started/quickstart) — See PRFlow in action
- [**GitHub App Setup**](/docs/getting-started/github-app-setup) — Enable advanced features
- [**Configuration**](/docs/guides/configuration) — Customize behavior
