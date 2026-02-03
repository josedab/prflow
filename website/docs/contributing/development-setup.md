---
sidebar_position: 2
title: Development Setup
description: Set up your local development environment for PRFlow
---

# Development Setup

This guide helps you set up a local development environment for contributing to PRFlow.

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 20+ | Runtime |
| pnpm | 9+ | Package manager |
| Docker | 20+ | PostgreSQL & Redis |
| Git | 2.30+ | Version control |

### Installing Prerequisites

**Node.js (via nvm):**
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 20
nvm use 20
```

**pnpm:**
```bash
npm install -g pnpm
```

**Docker:**
- macOS: [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- Linux: Follow [Docker Engine install guide](https://docs.docker.com/engine/install/)
- Windows: [Docker Desktop with WSL2](https://docs.docker.com/desktop/install/windows-install/)

---

## Quick Setup

```bash
# 1. Clone (after forking on GitHub)
git clone https://github.com/YOUR_USERNAME/prflow.git
cd prflow

# 2. Install dependencies
pnpm install

# 3. Start infrastructure (PostgreSQL + Redis)
docker compose -f docker/docker-compose.yml up -d

# 4. Configure environment
cp .env.example .env

# 5. Initialize database
pnpm db:generate
pnpm db:migrate

# 6. Start development servers
pnpm dev
```

You should now have:
- **API Server** running at `http://localhost:3001`
- **Web Dashboard** running at `http://localhost:3000`
- **PostgreSQL** at `localhost:5432`
- **Redis** at `localhost:6379`

---

## Detailed Setup

### 1. Fork and Clone

```bash
# Fork the repo on GitHub first, then:
git clone https://github.com/YOUR_USERNAME/prflow.git
cd prflow

# Add upstream remote for syncing
git remote add upstream https://github.com/josedab/prflow.git

# Verify remotes
git remote -v
```

### 2. Install Dependencies

PRFlow is a pnpm workspace monorepo:

```bash
pnpm install
```

This installs dependencies for all packages:
- `apps/api` — Fastify API server
- `apps/web` — Next.js dashboard
- `apps/action` — GitHub Action
- `packages/core` — Shared types and utilities
- `packages/db` — Prisma database client
- `packages/github-client` — GitHub API wrapper
- `packages/config` — Configuration management

### 3. Start Infrastructure

```bash
# Start PostgreSQL and Redis
docker compose -f docker/docker-compose.yml up -d

# Verify containers are running
docker ps
# Should show: prflow-postgres, prflow-redis
```

**Alternative: Local PostgreSQL and Redis**

If you prefer not to use Docker:

```bash
# macOS with Homebrew
brew install postgresql@15 redis
brew services start postgresql@15
brew services start redis
```

Update `.env` with your connection strings.

### 4. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your settings:

```bash title=".env"
# Application
NODE_ENV=development
PORT=3001
LOG_LEVEL=debug

# Database
DATABASE_URL=postgresql://prflow:prflow@localhost:5432/prflow

# Redis
REDIS_URL=redis://localhost:6379

# GitHub App (optional for local dev - see below)
# GITHUB_APP_ID=
# GITHUB_APP_PRIVATE_KEY=
# GITHUB_WEBHOOK_SECRET=

# Session
SESSION_SECRET=development-secret-change-in-production

# LLM (optional)
# OPENAI_API_KEY=sk-...
```

:::tip
For local development without GitHub integration, you can leave GitHub App settings empty. The API will run in "offline mode" for testing.
:::

### 5. Initialize Database

```bash
# Generate Prisma client
pnpm db:generate

# Run migrations
pnpm db:migrate

# (Optional) Seed with sample data
pnpm db:seed
```

### 6. Start Development

**All services:**
```bash
pnpm dev
```

**Individual services:**
```bash
# API only
pnpm --filter @prflow/api dev

# Web dashboard only
pnpm --filter @prflow/web dev

# Both API and Web
pnpm dev --filter "@prflow/api" --filter "@prflow/web"
```

---

## Project Structure

```
prflow/
├── apps/
│   ├── api/                    # Fastify REST API
│   │   ├── src/
│   │   │   ├── agents/         # AI agents
│   │   │   │   ├── analyzer.ts
│   │   │   │   ├── reviewer.ts
│   │   │   │   ├── test-generator.ts
│   │   │   │   └── documentation.ts
│   │   │   ├── routes/         # API endpoints
│   │   │   │   ├── health.ts
│   │   │   │   ├── repositories.ts
│   │   │   │   ├── workflows.ts
│   │   │   │   └── webhooks.ts
│   │   │   ├── services/       # Business logic
│   │   │   ├── workers/        # Background processors
│   │   │   └── index.ts        # Entry point
│   │   ├── __tests__/
│   │   └── package.json
│   │
│   ├── web/                    # Next.js dashboard
│   │   ├── src/
│   │   │   ├── app/            # App router
│   │   │   ├── components/     # React components
│   │   │   └── lib/            # Utilities
│   │   ├── __tests__/
│   │   └── package.json
│   │
│   └── action/                 # GitHub Action
│       ├── src/
│       ├── action.yml
│       └── package.json
│
├── packages/
│   ├── core/                   # Shared types & utilities
│   │   ├── src/
│   │   │   ├── types/          # TypeScript types
│   │   │   ├── agents/         # Base agent classes
│   │   │   └── utils/          # Shared utilities
│   │   └── package.json
│   │
│   ├── db/                     # Database
│   │   ├── prisma/
│   │   │   ├── schema.prisma   # Database schema
│   │   │   └── migrations/     # SQL migrations
│   │   └── package.json
│   │
│   ├── github-client/          # GitHub API
│   │   ├── src/
│   │   └── package.json
│   │
│   └── config/                 # Configuration
│       ├── src/
│       └── package.json
│
├── docker/
│   ├── docker-compose.yml      # Local development
│   └── Dockerfile              # Production build
│
├── website/                    # Documentation (Docusaurus)
│
├── .env.example
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.json
└── turbo.json
```

---

## Common Development Tasks

### Running Tests

```bash
# All tests
pnpm test

# Specific package
pnpm --filter @prflow/api test
pnpm --filter @prflow/core test

# Watch mode
pnpm --filter @prflow/api test -- --watch

# Coverage report
pnpm test -- --coverage
```

### Linting and Formatting

```bash
# Check for issues
pnpm lint

# Auto-fix issues
pnpm lint -- --fix

# Format code
pnpm format

# Type checking
pnpm typecheck
```

### Building

```bash
# Build all packages
pnpm build

# Build specific package
pnpm --filter @prflow/api build

# Clean build artifacts
pnpm clean
```

### Database Operations

```bash
# Generate Prisma client after schema changes
pnpm db:generate

# Create and run migration
pnpm db:migrate -- --name your_migration_name

# Reset database (drops and recreates)
pnpm db:reset

# Open Prisma Studio (GUI)
pnpm db:studio

# Push schema changes without migration (dev only)
pnpm db:push
```

### Adding Dependencies

```bash
# Add to specific package
pnpm --filter @prflow/api add express
pnpm --filter @prflow/api add -D jest

# Add to root (dev tools)
pnpm add -Dw typescript
```

---

## Developing Features

### Adding a New API Endpoint

1. **Create route file:**

```typescript title="apps/api/src/routes/my-endpoint.ts"
import { FastifyPluginAsync } from 'fastify';

export const myEndpointRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/my-endpoint', async (request, reply) => {
    return { message: 'Hello!' };
  });

  fastify.post('/my-endpoint', {
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { name } = request.body as { name: string };
    return { greeting: `Hello, ${name}!` };
  });
};
```

2. **Register in app:**

```typescript title="apps/api/src/index.ts"
import { myEndpointRoutes } from './routes/my-endpoint';

// ...
fastify.register(myEndpointRoutes, { prefix: '/api' });
```

3. **Add tests:**

```typescript title="apps/api/src/__tests__/routes/my-endpoint.test.ts"
import { buildApp } from '../../app';

describe('my-endpoint', () => {
  let app;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /my-endpoint returns message', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/my-endpoint',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ message: 'Hello!' });
  });
});
```

### Adding a New Agent

1. **Create agent file:**

```typescript title="apps/api/src/agents/compliance.ts"
import { BaseAgent, AgentContext, AgentResult } from '@prflow/core';

interface ComplianceInput {
  diff: Diff;
  rules: ComplianceRule[];
}

interface ComplianceOutput {
  violations: Violation[];
  passed: boolean;
}

export class ComplianceAgent extends BaseAgent<ComplianceInput, ComplianceOutput> {
  readonly name = 'compliance';
  readonly description = 'Check code for compliance violations';

  async execute(
    input: ComplianceInput,
    context: AgentContext
  ): Promise<AgentResult<ComplianceOutput>> {
    const { result, latencyMs } = await this.measureExecution(async () => {
      const violations = await this.checkCompliance(input.diff, input.rules);
      return {
        violations,
        passed: violations.length === 0,
      };
    });

    return this.createSuccessResult(result, latencyMs);
  }

  private async checkCompliance(diff: Diff, rules: ComplianceRule[]): Promise<Violation[]> {
    // Implementation
    return [];
  }
}
```

2. **Export from agents index:**

```typescript title="apps/api/src/agents/index.ts"
export { ComplianceAgent } from './compliance';
```

3. **Add tests:**

```typescript title="apps/api/src/__tests__/agents/compliance.test.ts"
import { ComplianceAgent } from '../../agents/compliance';

describe('ComplianceAgent', () => {
  let agent: ComplianceAgent;

  beforeEach(() => {
    agent = new ComplianceAgent();
  });

  it('should detect PCI compliance violations', async () => {
    const diff = createMockDiff({
      files: [{
        name: 'payment.ts',
        content: 'const cardNumber = "4111111111111111";',
      }],
    });

    const result = await agent.execute({
      diff,
      rules: [{ type: 'pci-dss', pattern: /\d{16}/ }],
    }, mockContext);

    expect(result.success).toBe(true);
    expect(result.data.passed).toBe(false);
    expect(result.data.violations).toHaveLength(1);
  });
});
```

### Updating Database Schema

1. **Modify schema:**

```prisma title="packages/db/prisma/schema.prisma"
model Workflow {
  id          String   @id @default(cuid())
  repository  String
  prNumber    Int
  status      String
  // Add new field
  priority    Int      @default(0)
  createdAt   DateTime @default(now())
}
```

2. **Create migration:**

```bash
pnpm db:migrate -- --name add_workflow_priority
```

3. **Update types if needed:**

```typescript title="packages/core/src/types/workflow.ts"
export interface Workflow {
  id: string;
  repository: string;
  prNumber: number;
  status: string;
  priority: number; // Add new field
  createdAt: Date;
}
```

---

## Setting Up GitHub App (Optional)

For testing GitHub integration locally:

### 1. Create GitHub App

1. Go to GitHub Settings → Developer settings → GitHub Apps
2. Click "New GitHub App"
3. Configure:
   - **Name:** `PRFlow Dev - YOUR_NAME`
   - **Homepage URL:** `http://localhost:3000`
   - **Webhook URL:** Use ngrok or similar (see below)
   - **Permissions:** See [GitHub App Setup](/docs/getting-started/github-app-setup)
4. Generate private key and save it

### 2. Expose Local Server

Use ngrok to expose your local server for webhooks:

```bash
# Install ngrok
brew install ngrok  # or download from ngrok.com

# Expose port 3001
ngrok http 3001

# You'll get a URL like: https://abc123.ngrok.io
```

Update your GitHub App webhook URL to: `https://abc123.ngrok.io/api/webhooks/github`

### 3. Configure Environment

```bash title=".env"
GITHUB_APP_ID=123456
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----
...
-----END RSA PRIVATE KEY-----"
GITHUB_WEBHOOK_SECRET=your-webhook-secret
```

---

## Troubleshooting

### Database Connection Failed

```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# Check logs
docker logs prflow-postgres

# Restart
docker compose -f docker/docker-compose.yml restart postgres
```

### Redis Connection Failed

```bash
# Check if Redis is running
docker ps | grep redis

# Test connection
redis-cli ping
# Should return: PONG
```

### Port Already in Use

```bash
# Find process using port
lsof -i :3001

# Kill it
kill -9 <PID>

# Or use different port
PORT=3002 pnpm dev
```

### Prisma Client Outdated

After pulling changes that modified the schema:

```bash
pnpm db:generate
```

### Node Modules Issues

```bash
# Clear and reinstall
rm -rf node_modules
pnpm install
```

### TypeScript Errors After Changes

```bash
# Clean build artifacts
pnpm clean

# Rebuild
pnpm build
```

---

## IDE Setup

### VS Code

Recommended extensions:
- ESLint
- Prettier
- Prisma
- TypeScript and JavaScript Language Features

Settings:

```json title=".vscode/settings.json"
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "typescript.tsdk": "node_modules/typescript/lib"
}
```

### WebStorm / IntelliJ

- Enable ESLint integration
- Set Prettier as default formatter
- Configure TypeScript to use project version

---

## Next Steps

- [**Contributing Guide**](/docs/contributing/overview) — How to submit changes
- [**Architecture**](/docs/concepts/architecture) — System design
- [**API Reference**](/docs/api-reference) — API documentation
