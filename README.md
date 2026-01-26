# PRFlow

[![CI](https://github.com/josedab/prflow/actions/workflows/ci.yml/badge.svg)](https://github.com/josedab/prflow/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org/)

**Intelligent Pull Request Automation Platform**

PRFlow is an end-to-end pull request automation platform that handles code analysis, review, test generation, documentation updates, and merge orchestration.

## Table of Contents

- [Features](#features)
- [Project Structure](#project-structure)
- [Quick Start](#quick-start)
- [GitHub App Setup](#github-app-setup)
- [GitHub Action Usage](#github-action-usage)
- [API Endpoints](#api-endpoints)
- [Development](#development)
- [Architecture](#architecture)
- [Contributing](#contributing)
- [License](#license)

## Features

- 🔍 **PR Analysis** - Semantic change detection, impact analysis, risk assessment
- 🐛 **Code Review** - Automated bug, security, and performance issue detection
- 🧪 **Test Generation** - Automatic unit test creation for new code
- 📝 **Documentation** - JSDoc generation and README updates
- 👥 **Smart Assignment** - Intelligent reviewer suggestions based on expertise
- 🔀 **Merge Orchestration** - Automated merge queue management
- 📊 **Analytics** - Team metrics and productivity insights

## Project Structure

```
prflow/
├── apps/
│   ├── api/          # Main API service (Fastify)
│   ├── web/          # Dashboard (Next.js)
│   └── action/       # GitHub Action
├── packages/
│   ├── core/         # Shared business logic & types
│   ├── github-client/# GitHub API wrapper
│   ├── db/           # Database client (Prisma)
│   └── config/       # Shared configuration
└── docker/           # Docker configurations
```

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker (for local development)

### Installation

```bash
# Clone the repository (replace josedab with actual organization)
git clone https://github.com/josedab/prflow.git
cd prflow

# Install dependencies
pnpm install

# Start infrastructure (PostgreSQL, Redis)
docker compose -f docker/docker-compose.yml up -d

# Copy environment variables
cp .env.example .env

# Generate Prisma client
pnpm db:generate

# Run database migrations
pnpm db:migrate

# Start development servers
pnpm dev
```

### Environment Variables

```bash
# Application
NODE_ENV=development
PORT=3001

# Database
DATABASE_URL=postgresql://prflow:prflow@localhost:5432/prflow

# Redis
REDIS_URL=redis://localhost:6379

# GitHub App
GITHUB_APP_ID=your-app-id
GITHUB_APP_PRIVATE_KEY=your-private-key
GITHUB_WEBHOOK_SECRET=your-webhook-secret
GITHUB_CLIENT_ID=your-client-id
GITHUB_CLIENT_SECRET=your-client-secret

# Session
SESSION_SECRET=your-session-secret-at-least-32-chars
```

## GitHub App Setup

1. Create a new GitHub App at https://github.com/settings/apps
2. Configure the following permissions:
   - **Repository permissions:**
     - Contents: Read
     - Pull requests: Read & Write
     - Checks: Read & Write
     - Issues: Read & Write
   - **Subscribe to events:**
     - Pull request
     - Pull request review
3. Generate a private key and configure webhook URL

## GitHub Action Usage

```yaml
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
      
      - uses: prflow/action@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          review-enabled: true
          test-generation: true
          severity-threshold: medium
```

## API Endpoints

### Health
- `GET /api/health` - Health check
- `GET /api/health/ready` - Readiness check

### Repositories
- `GET /api/repositories` - List repositories
- `GET /api/repositories/:owner/:repo` - Get repository
- `PATCH /api/repositories/:owner/:repo/settings` - Update settings

### Workflows
- `GET /api/workflows` - List workflows
- `GET /api/workflows/:id` - Get workflow details
- `GET /api/workflows/:id/comments` - Get review comments
- `GET /api/workflows/:id/tests` - Get generated tests

### Analytics
- `GET /api/analytics/metrics` - Team metrics
- `GET /api/analytics/trends` - Trend data
- `GET /api/analytics/export` - Export metrics

## Development

```bash
# Run all services
pnpm dev

# Run only API
pnpm --filter @prflow/api dev

# Run only web dashboard
pnpm --filter @prflow/web dev

# Run tests
pnpm test

# Run linting
pnpm lint

# Build all packages
pnpm build
```

## Architecture

PRFlow uses a multi-agent architecture:

1. **Analyzer Agent** - Parses PR diff, detects semantic changes, assesses risk
2. **Reviewer Agent** - Identifies bugs, security issues, performance problems
3. **Test Generator Agent** - Creates unit tests for new code
4. **Documentation Agent** - Generates JSDoc and documentation updates
5. **Synthesis Agent** - Summarizes findings for human reviewers

Agents run in parallel where possible and results are synthesized into a comprehensive PR summary.

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) before submitting PRs.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
