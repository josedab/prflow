# @prflow/db

Database layer for PRFlow using Prisma ORM.

## Installation

This is an internal package. It's automatically available in the monorepo workspace:

```typescript
import { db } from '@prflow/db';
```

## Schema Overview

The database schema includes the following main entities:

### Organizations & Teams

```
Organization
├── Team (many)
│   ├── TeamMember (many)
│   └── Subscription (one)
└── Repository (many)
```

### Users

```
User
├── TeamMember (many)
└── Session (many)
```

### Repositories & Workflows

```
Repository
├── RepositorySettings (one)
├── TestPattern (many)
└── PRWorkflow (many)
    ├── PRAnalysis (one)
    ├── ReviewComment (many)
    │   └── FixApplication (many)
    ├── GeneratedTest (many)
    ├── DocUpdate (many)
    └── PRSynthesis (one)
```

### Enterprise Features

- `PRHealthScore` - Health metrics per PR
- `TeamHealthMetrics` - Aggregate team metrics
- `ReviewPattern` - Learned patterns from codebase
- `CodebaseContext` - Repository learning data
- `PRSplitProposal` / `PRSplit` - PR splitting data
- `DebtItem` / `DebtSprint` / `DebtPolicy` - Technical debt tracking
- `IntentAnalysis` - Code intent detection
- `AnalyticsEvent` - Event tracking

## Usage

### Basic Queries

```typescript
import { db } from '@prflow/db';

// Get a repository with settings
const repo = await db.repository.findUnique({
  where: { fullName: 'owner/repo' },
  include: { settings: true },
});

// Get workflow with all related data
const workflow = await db.pRWorkflow.findUnique({
  where: { id: 'workflow-id' },
  include: {
    analysis: true,
    reviewComments: true,
    generatedTests: true,
    synthesis: true,
  },
});

// Create a new workflow
const newWorkflow = await db.pRWorkflow.create({
  data: {
    repositoryId: 'repo-id',
    prNumber: 123,
    prTitle: 'Add feature',
    prUrl: 'https://github.com/...',
    headBranch: 'feature/new',
    baseBranch: 'main',
    authorLogin: 'username',
    status: 'PENDING',
  },
});
```

### Transactions

```typescript
import { db } from '@prflow/db';

// Use transactions for multi-step operations
const result = await db.$transaction(async (tx) => {
  const workflow = await tx.pRWorkflow.update({
    where: { id: 'workflow-id' },
    data: { status: 'COMPLETED' },
  });

  await tx.pRSynthesis.create({
    data: {
      workflowId: workflow.id,
      summary: 'Analysis complete',
      riskAssessment: {},
      findingsSummary: {},
      humanReviewChecklist: [],
    },
  });

  return workflow;
});
```

### Raw Queries

```typescript
import { db } from '@prflow/db';

// Health check
await db.$queryRaw`SELECT 1`;

// Complex aggregation
const stats = await db.$queryRaw`
  SELECT
    COUNT(*) as total,
    AVG(latency_ms) as avg_latency
  FROM pr_workflows
  WHERE status = 'COMPLETED'
`;
```

## Enums

```typescript
// Workflow status
type WorkflowStatus =
  | 'PENDING'
  | 'ANALYZING'
  | 'REVIEWING'
  | 'GENERATING_TESTS'
  | 'UPDATING_DOCS'
  | 'SYNTHESIZING'
  | 'COMPLETED'
  | 'FAILED';

// Severity levels
type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NITPICK';

// Review categories
type ReviewCategory =
  | 'SECURITY'
  | 'BUG'
  | 'PERFORMANCE'
  | 'ERROR_HANDLING'
  | 'TESTING'
  | 'DOCUMENTATION'
  | 'STYLE'
  | 'MAINTAINABILITY';

// PR types
type PRType = 'FEATURE' | 'BUGFIX' | 'REFACTOR' | 'DOCS' | 'CHORE' | 'TEST' | 'DEPS';

// Risk levels
type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
```

## Development

### Commands

```bash
# Generate Prisma client
pnpm generate

# Run migrations (development)
pnpm migrate

# Push schema changes (quick dev)
pnpm push

# Open Prisma Studio
pnpm studio

# Build
pnpm build
```

### Migration Workflow

1. Modify `prisma/schema.prisma`
2. Run `pnpm migrate` to create migration
3. Migration is automatically applied
4. Prisma client is regenerated

### Environment

```bash
DATABASE_URL=postgresql://user:password@localhost:5432/prflow
```

## Dependencies

- `@prisma/client` - Prisma ORM client
- `prisma` - CLI and schema tools (dev)
