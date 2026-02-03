# @prflow/core

Shared types, models, and utilities for PRFlow.

## Installation

This is an internal package. It's automatically available in the monorepo workspace:

```typescript
import { PRAnalysis, ReviewComment } from '@prflow/core';
import { DebtItem, SkippedReview } from '@prflow/core/models';
import { AgentContext, AgentResult } from '@prflow/core/agents';
```

## Exports

### Main (`@prflow/core`)

Core types and utilities used across all PRFlow packages.

#### Types

```typescript
// Pull Request types
interface PullRequest {
  number: number;
  title: string;
  body: string | null;
  head: { ref: string; sha: string };
  base: { ref: string };
  author: { login: string };
}

interface PRDiff {
  files: DiffFile[];
  totalAdditions: number;
  totalDeletions: number;
}

// Analysis types
interface PRAnalysis {
  prNumber: number;
  type: 'feature' | 'bugfix' | 'refactor' | 'docs' | 'chore' | 'test' | 'deps';
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  changes: { filesModified: number; linesAdded: number; linesRemoved: number };
  semanticChanges: SemanticChange[];
  impactRadius: ImpactRadius;
  risks: string[];
  suggestedReviewers: SuggestedReviewer[];
}

// Review types
interface ReviewComment {
  id: string;
  file: string;
  line: number;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'nitpick';
  category: 'security' | 'bug' | 'performance' | 'error_handling' | 'testing' | 'documentation' | 'style' | 'maintainability';
  message: string;
  suggestion?: CodeSuggestion;
  confidence: number;
}
```

#### Utilities

```typescript
// File utilities
getFileExtension(filename: string): string
getLanguageFromExtension(ext: string): string
```

### Models (`@prflow/core/models`)

Extended types for advanced features.

```typescript
// Technical Debt
import { DebtItem, DebtSprint, DebtPolicy, SkippedReview } from '@prflow/core/models';

// Code Intent Analysis
import { IntentAnalysis, IntentCategory } from '@prflow/core/models';

// Compliance
import { ComplianceProfile, ComplianceViolation } from '@prflow/core/models';

// Knowledge Graph
import { GraphNode, GraphEdge, ImpactAnalysis } from '@prflow/core/models';

// Multi-Repo
import { MultiRepoContext, CrossRepoChange } from '@prflow/core/models';

// Review Personas
import { ReviewPersona, PersonaConfig } from '@prflow/core/models';
```

### Agents (`@prflow/core/agents`)

Agent interface types.

```typescript
import { AgentContext, AgentResult, AgentError } from '@prflow/core/agents';

interface AgentContext {
  repositoryId: string;
  installationId: number;
  pr: PullRequest;
  diff: PRDiff;
}

interface AgentResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  latencyMs: number;
}
```

## Usage Examples

### Working with PR Analysis

```typescript
import type { PRAnalysis, SemanticChange } from '@prflow/core';

function summarizeChanges(analysis: PRAnalysis): string {
  const highImpact = analysis.semanticChanges
    .filter(c => c.impact === 'high')
    .map(c => c.name);

  return `${analysis.type} PR with ${highImpact.length} high-impact changes`;
}
```

### Working with Review Comments

```typescript
import type { ReviewComment, Severity } from '@prflow/core';

function filterBySeverity(comments: ReviewComment[], minSeverity: Severity): ReviewComment[] {
  const severityOrder = ['critical', 'high', 'medium', 'low', 'nitpick'];
  const minIndex = severityOrder.indexOf(minSeverity);

  return comments.filter(c => severityOrder.indexOf(c.severity) <= minIndex);
}
```

## Development

```bash
# Build
pnpm build

# Watch mode
pnpm dev

# Run tests
pnpm test

# Lint
pnpm lint
```

## Dependencies

- `zod` - Runtime validation
