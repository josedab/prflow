# PRFlow

[![CI](https://github.com/josedab/prflow/actions/workflows/ci.yml/badge.svg)](https://github.com/josedab/prflow/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/josedab/prflow?quickstart=1)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)
[![pnpm](https://img.shields.io/badge/pnpm-9.0+-orange)](https://pnpm.io/)
[![Turborepo](https://img.shields.io/badge/Turborepo-2.0-blueviolet)](https://turbo.build/)

**Intelligent Pull Request Automation Platform**

PRFlow transforms code review from a bottleneck into a streamlined workflow. It automates the mechanical 70% of review work—style checks, test coverage, documentation—while amplifying human reviewers to focus on architectural and design decisions.

## The Problem

- Developers spend **4-6 hours/week** on code review
- PRs wait **24-72 hours** for first review
- **30%** of engineering time spent on review-related activities
- **65%** of PRs require multiple review cycles before merge

## Table of Contents

- [Quick Start](#quick-start)
- [Features](#features)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [GitHub App Setup](#github-app-setup)
- [GitHub Action Usage](#github-action-usage)
- [VS Code Extension](#vs-code-extension)
- [API Reference](#api-reference)
- [Development](#development)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)

## Quick Start

### Prerequisites

- **Node.js** 20+ (use `nvm install` — reads `.nvmrc` automatically)
- **pnpm** 9+ (`corepack enable` to activate)
- **Docker** (for PostgreSQL and Redis — *not needed for lite mode*)

### Zero-Config Quick Try (No Docker)

Just want to explore the API? No Docker, no database, no `.env`:

```bash
git clone https://github.com/josedab/prflow.git
cd prflow
pnpm install
pnpm dev:lite
```

This starts the API at http://localhost:3001 with in-memory mocks. Jump to [Try It](#-try-it--30-seconds) below.

### Full Setup (One Command)

```bash
# Clone the repository
git clone https://github.com/josedab/prflow.git
cd prflow

# Run the bootstrap script (installs deps, starts Docker, initializes DB)
pnpm bootstrap

# Start the API server (API on :3001)
pnpm dev:api
```

> **No GitHub App needed to start!** The app runs in local exploration mode by default.
> Configure GitHub integration later by editing `.env` — see [GitHub App Setup](#github-app-setup).

The API is ready when you see `Server running on port 3001` in the output.

Want the Dashboard too? Run `pnpm dev` instead — it starts both the API (:3001) and the Next.js Dashboard (:3000).

### 🎯 Try It — 30 Seconds

Once the API is running, try the built-in playground. No config needed:

```bash
# 1. Verify the API is up
curl http://localhost:3001/api/health
# → {"status":"ok","timestamp":"..."}

# 2. Analyze a sample diff with intentional security issues
curl -s -X POST http://localhost:3001/api/playground/analyze \
  -H "Content-Type: application/json" \
  -d '{"diff": "diff --git a/src/auth.ts b/src/auth.ts\n--- a/src/auth.ts\n+++ b/src/auth.ts\n@@ -1,3 +1,8 @@\n+export async function login(req) {\n+  const user = await db.query(\"SELECT * FROM users WHERE email = \\x27\" + req.body.email + \"\\x27\");\n+  if (user && req.body.password === user.password) {\n+    const token = jwt.sign({ id: user.id }, \"hardcoded-secret\");\n+    return { token };\n+  }\n+}"}' | python3 -m json.tool
```

Look for `CRITICAL` severity findings — PRFlow detects SQL injection, hardcoded secrets, and more.

> 📂 See [`examples/`](examples/) for more runnable demos including a Node.js API client.
> 📖 Browse all endpoints interactively at http://localhost:3001/api/docs (Swagger UI).

### Manual Setup (step-by-step)

<details>
<summary>Click to expand manual steps</summary>

```bash
pnpm install
docker compose -f docker/docker-compose.yml up -d
cp .env.example .env
pnpm db:generate
pnpm db:migrate
pnpm dev:api
```

</details>

### Available Commands

> **`pnpm` is the primary interface.** The `Makefile` provides convenience aliases — use whichever you prefer. Run `make help` to see all available targets.

See the [Development](#development) section below for the full command list.

### Services

| Service | URL | Description |
|---------|-----|-------------|
| API | http://localhost:3001 | Fastify REST API |
| API Docs | http://localhost:3001/api/docs | Interactive API documentation |
| Dashboard | http://localhost:3000 | Next.js web interface (start with `pnpm dev`) |
| PostgreSQL | localhost:5432 | Database |
| Redis | localhost:6379 | Cache & job queue |

### Environment Variables

> If you ran `pnpm bootstrap`, these are already set. See [`.env.example`](.env.example) for all options.

```bash
# ── Required (auto-configured by bootstrap) ──────────
NODE_ENV=development
PORT=3001
LOG_LEVEL=debug
DATABASE_URL=postgresql://prflow:prflow@localhost:5432/prflow
REDIS_URL=redis://localhost:6379
SESSION_SECRET=prflow-dev-session-secret-change-me-in-production-please
NEXT_PUBLIC_API_URL=http://localhost:3001

# ── Optional: GitHub App (for webhook processing) ────
# The app starts without these — see "GitHub App Setup" below.
# GITHUB_APP_ID=
# GITHUB_APP_PRIVATE_KEY=
# GITHUB_WEBHOOK_SECRET=
# GITHUB_CLIENT_ID=
# GITHUB_CLIENT_SECRET=

# ── Optional: AI features ────────────────────────────
# COPILOT_API_KEY=
```

## Features

### Core Capabilities

| Feature | Description |
|---------|-------------|
| 🔍 **PR Analysis** | Semantic change detection, impact analysis, risk assessment |
| 🐛 **Code Review** | Automated bug, security, and performance issue detection |
| 🧪 **Test Generation** | Automatic unit test creation for new code |
| 📝 **Documentation** | JSDoc generation and README updates |
| 👥 **Smart Assignment** | Intelligent reviewer suggestions based on expertise |
| 🔀 **Merge Orchestration** | Automated merge queue management |
| 📊 **Analytics** | Team metrics and productivity insights |

### Enterprise Features

| Feature | Description |
|---------|-------------|
| 🔐 **Security & Compliance** | Vulnerability scanning, compliance checking, audit logs |
| 🎓 **Learning Paths** | Interactive training and knowledge management |
| 📈 **Technical Debt Dashboard** | Track and manage technical debt across repositories |
| 🔗 **Multi-Repo Orchestration** | Cross-repository analysis and dependency tracking |
| 🤖 **ML Training Pipeline** | Learn from historical reviews to improve suggestions |
| 💡 **Natural Language Queries** | Ask questions about code changes in plain English |
| 🎭 **Review Personas** | Configurable review styles (strict, mentor, quick) |
| ⚡ **Predictive CI** | Predict CI failures before they happen |
| ✂️ **PR Splitting** | Automatically decompose large PRs into reviewable chunks |
| 🔄 **Auto-Remediation** | One-click fixes for common issues |

## Architecture

PRFlow uses a multi-agent architecture where specialized AI agents process pull requests in parallel:

```mermaid
flowchart TB
    subgraph GitHub["GitHub"]
        PR[Pull Request]
        Webhook[Webhook Event]
    end

    subgraph PRFlow["PRFlow Platform"]
        subgraph API["API Layer (Fastify)"]
            Routes[Route Handlers]
            Auth[Authentication]
            WS[WebSocket Server]
        end

        subgraph Queue["Job Queue"]
            Redis[(Redis)]
            BullMQ[BullMQ Workers]
        end

        subgraph Agents["Multi-Agent System"]
            Analyzer[🔍 Analyzer Agent]
            Reviewer[🐛 Reviewer Agent]
            TestGen[🧪 Test Generator]
            DocGen[📝 Documentation Agent]
            Synthesis[📋 Synthesis Agent]
        end

        subgraph Services["Business Services"]
            Analytics[Analytics Service]
            Assignment[Assignment Service]
            Security[Security Scanner]
            Learning[Learning Engine]
        end

        subgraph Data["Data Layer"]
            Prisma[Prisma ORM]
            PostgreSQL[(PostgreSQL)]
        end
    end

    subgraph Dashboard["Dashboard (Next.js)"]
        WebUI[Web Interface]
    end

    PR --> Webhook
    Webhook --> Routes
    Routes --> BullMQ
    BullMQ --> Analyzer

    Analyzer --> Reviewer
    Analyzer --> TestGen
    Analyzer --> DocGen

    Reviewer --> Synthesis
    TestGen --> Synthesis
    DocGen --> Synthesis

    Synthesis --> GitHub

    Services --> Prisma
    Prisma --> PostgreSQL

    WebUI --> Routes
    Routes --> WS
```

### Agent Workflow

```mermaid
sequenceDiagram
    participant GH as GitHub
    participant API as PRFlow API
    participant AN as Analyzer Agent
    participant RV as Reviewer Agent
    participant TG as Test Generator
    participant DC as Documentation Agent
    participant SY as Synthesis Agent

    GH->>API: PR Webhook Event
    API->>AN: Analyze PR

    AN->>AN: Parse diff
    AN->>AN: Detect semantic changes
    AN->>AN: Assess risk level

    par Parallel Processing
        AN->>RV: Review code
        AN->>TG: Generate tests
        AN->>DC: Update docs
    end

    RV->>SY: Review findings
    TG->>SY: Generated tests
    DC->>SY: Doc updates

    SY->>SY: Consolidate findings
    SY->>GH: Post review comments
    SY->>GH: Create check run
```

### PR Workflow States

```mermaid
stateDiagram-v2
    [*] --> PENDING: PR Created
    PENDING --> ANALYZING: Start Processing
    ANALYZING --> REVIEWING: Analysis Complete
    REVIEWING --> GENERATING_TESTS: Review Complete
    GENERATING_TESTS --> UPDATING_DOCS: Tests Generated
    UPDATING_DOCS --> SYNTHESIZING: Docs Updated
    SYNTHESIZING --> COMPLETED: Synthesis Done

    ANALYZING --> FAILED: Error
    REVIEWING --> FAILED: Error
    GENERATING_TESTS --> FAILED: Error
    UPDATING_DOCS --> FAILED: Error
    SYNTHESIZING --> FAILED: Error

    COMPLETED --> [*]
    FAILED --> [*]
```

## Project Structure

```
prflow/
├── apps/
│   ├── api/                    # Main API service (Fastify)
│   │   ├── src/
│   │   │   ├── agents/         # AI agents (21 specialized agents)
│   │   │   ├── routes/         # API endpoints (43 route files)
│   │   │   ├── services/       # Business logic services
│   │   │   ├── jobs/           # Background job workers
│   │   │   └── lib/            # Utilities (logger, rate limiting, WebSocket)
│   │   └── package.json
│   │
│   ├── web/                    # Dashboard (Next.js 15)
│   │   ├── src/
│   │   │   ├── app/            # Next.js app router
│   │   │   ├── components/     # React components
│   │   │   └── lib/            # Frontend utilities
│   │   └── package.json
│   │
│   └── action/                 # GitHub Action for CI/CD integration
│       └── package.json
│
├── packages/
│   ├── core/                   # Shared types, models, and utilities
│   ├── github-client/          # GitHub API wrapper (Octokit)
│   ├── db/                     # Database layer (Prisma)
│   └── config/                 # Shared configuration
│
├── extensions/
│   └── vscode-prflow/          # VS Code extension for pre-flight checks
│
├── docker/
│   └── docker-compose.yml      # PostgreSQL + Redis stack
│
└── docs/                       # Additional documentation
    ├── API.md                  # Full API reference
    └── ARCHITECTURE.md         # Detailed architecture docs
```

## GitHub App Setup

1. **Create a GitHub App** at https://github.com/settings/apps

2. **Configure permissions:**

   | Permission | Access | Purpose |
   |------------|--------|---------|
   | Contents | Read | Read repository files |
   | Pull requests | Read & Write | Create review comments |
   | Checks | Read & Write | Report analysis status |
   | Issues | Read & Write | Create follow-up issues |
   | Metadata | Read | Repository information |

3. **Subscribe to events:**
   - `pull_request`
   - `pull_request_review`
   - `pull_request_review_comment`
   - `check_run`
   - `check_suite`

4. **Generate a private key** and download it

5. **Set webhook URL** to `https://your-domain.com/api/webhooks/github`

## GitHub Action Usage

Add PRFlow to your CI/CD pipeline:

```yaml
name: PRFlow Analysis

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

      - uses: prflow/action@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}

          # Feature toggles
          review-enabled: true
          test-generation: true
          doc-updates: true

          # Configuration
          severity-threshold: medium  # critical, high, medium, low
          auto-fix-style: true
          block-on-critical: true
```

### Action Inputs

| Input | Default | Description |
|-------|---------|-------------|
| `github-token` | required | GitHub token for API access |
| `review-enabled` | `true` | Enable automated code review |
| `test-generation` | `true` | Generate unit tests for new code |
| `doc-updates` | `true` | Suggest documentation updates |
| `severity-threshold` | `medium` | Minimum severity to report |
| `auto-fix-style` | `true` | Auto-fix style issues |
| `block-on-critical` | `true` | Block merge on critical issues |

## VS Code Extension

The PRFlow VS Code extension provides pre-flight checks before you commit:

### Installation

1. Open VS Code
2. Go to Extensions (`Cmd+Shift+X`)
3. Search for "PRFlow Pre-Flight"
4. Click Install

### Features

- **Pre-commit analysis** - Catch issues before they reach the PR
- **Inline diagnostics** - See issues directly in your editor
- **Quick fixes** - One-click fixes for common problems
- **Configurable severity** - Set your preferred threshold

### Commands

| Command | Description |
|---------|-------------|
| `PRFlow: Run Pre-Flight Check` | Analyze entire project |
| `PRFlow: Check Current File` | Analyze current file only |
| `PRFlow: Show Results` | Open results panel |
| `PRFlow: Configure` | Open settings |

## API Reference

See [docs/API.md](docs/API.md) for the complete API reference.

### Quick Reference

#### Health & Status
```
GET  /api/health              # Health check
GET  /api/health/ready        # Readiness check
```

#### Repositories
```
GET  /api/repositories                       # List repositories
GET  /api/repositories/:owner/:repo          # Get repository
PATCH /api/repositories/:owner/:repo/settings # Update settings
```

#### Workflows
```
GET  /api/workflows                # List workflows
GET  /api/workflows/:id            # Get workflow details
GET  /api/workflows/:id/comments   # Get review comments
GET  /api/workflows/:id/tests      # Get generated tests
POST /api/workflows/:id/retry      # Retry failed workflow
```

#### Analytics
```
GET  /api/analytics/metrics        # Team metrics
GET  /api/analytics/trends         # Trend data
GET  /api/analytics/export         # Export metrics (CSV/JSON)
```

#### Enterprise
```
GET  /api/enterprise/team-analytics    # Team performance
GET  /api/merge-queue                  # Merge queue status
POST /api/merge-queue/enqueue          # Add PR to queue
GET  /api/compliance/report            # Compliance report
GET  /api/knowledge-graph              # Knowledge graph data
```

## Development

### Commands

```bash
# Development
pnpm dev              # Run all services
pnpm dev:api          # Run API only
pnpm dev:lite         # Run API without Docker (in-memory mocks)
pnpm dev:web          # Run dashboard only

# Building
pnpm build            # Build all packages
pnpm build:api        # Build API only

# Testing
pnpm test             # Run all tests
pnpm test:unit        # Run unit tests only (no Docker needed)
pnpm test:watch       # Run tests in watch mode
pnpm test:coverage    # Run tests with coverage

# Linting & Formatting
pnpm lint             # Run ESLint
pnpm lint:fix         # Fix linting issues
pnpm format           # Run Prettier

# Database
pnpm db:generate      # Generate Prisma client
pnpm db:migrate       # Run migrations
pnpm db:push          # Push schema changes (dev)
pnpm db:studio        # Open Prisma Studio

# Monorepo
pnpm --filter @prflow/api dev     # Run specific package
pnpm --filter @prflow/web build   # Build specific package
```

### Package Scripts

Each package can be run individually:

```bash
# API development
cd apps/api && pnpm dev

# Web dashboard
cd apps/web && pnpm dev

# Run specific tests
pnpm --filter @prflow/api test
```

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed deployment instructions.

### Quick Deploy Options

#### Docker Compose (Recommended for staging)

> **Note:** Production Docker Compose and Kubernetes manifests are planned but not yet available.
> For now, use the development `docker-compose.yml` as a starting point:

```bash
docker compose -f docker/docker-compose.yml up -d
```

#### Environment Requirements

- PostgreSQL 16+
- Redis 7+
- Node.js 20+

## Contributing

We welcome contributions! Please read our [Contributing Guide](CONTRIBUTING.md) for details on:

- Code style and conventions
- Development workflow
- Pull request process
- Testing requirements

### Quick Start for Contributors

```bash
# Fork and clone
git clone https://github.com/YOUR_USERNAME/prflow.git
cd prflow

# Full setup (installs deps, starts Docker, initializes DB)
pnpm bootstrap

# Create feature branch
git checkout -b feature/your-feature

# Make changes and test
pnpm test

# Submit PR
```

> See the [Quick Start](#quick-start) section if you need manual setup steps.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  Built with ❤️ by the PRFlow team
</p>
