# Contributing to PRFlow

Thank you for your interest in contributing to PRFlow! This document provides guidelines and instructions for contributing.

## Code of Conduct

Please be respectful and constructive in all interactions. We're all here to build something great together.

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker (for local development)
- Git

### Development Setup

1. **Fork and clone the repository:**
   ```bash
   git clone https://github.com/YOUR_USERNAME/prflow.git
   cd prflow
   ```

2. **Install dependencies:**
   ```bash
   pnpm install
   ```

3. **Set up environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your development values
   ```

4. **Start infrastructure:**
   ```bash
   docker compose -f docker/docker-compose.yml up -d
   ```

5. **Initialize database:**
   ```bash
   pnpm db:generate
   pnpm db:migrate
   ```

6. **Start development servers:**
   ```bash
   pnpm dev
   ```

## Project Structure

```
prflow/
├── apps/
│   ├── api/          # Fastify API server
│   ├── web/          # Next.js dashboard
│   └── action/       # GitHub Action
├── packages/
│   ├── core/         # Shared types and utilities
│   ├── db/           # Prisma database client
│   ├── github-client/# GitHub API wrapper
│   └── config/       # Configuration management
└── docker/           # Docker configurations
```

## Development Workflow

### Branching Strategy

- `main` - Production-ready code
- `develop` - Integration branch for features
- `feature/*` - New features
- `fix/*` - Bug fixes
- `docs/*` - Documentation updates

### Creating a Branch

```bash
# From develop branch
git checkout develop
git pull origin develop
git checkout -b feature/your-feature-name
```

### Making Changes

1. Write your code following our style guide
2. Add tests for new functionality
3. Update documentation if needed
4. Run linting and tests locally

### Running Tests

```bash
# Run all tests
pnpm test

# Run specific package tests
pnpm --filter @prflow/api test

# Run tests in watch mode
pnpm --filter @prflow/api test -- --watch
```

### Linting

```bash
# Check for issues
pnpm lint

# Auto-fix issues
pnpm lint -- --fix

# Format code
pnpm format
```

### Building

```bash
# Build all packages
pnpm build

# Build specific package
pnpm --filter @prflow/api build
```

## Pull Request Process

1. **Create PR:**
   - Use a descriptive title
   - Fill out the PR template
   - Link related issues

2. **PR Title Format:**
   ```
   type(scope): description
   
   Examples:
   feat(api): add merge queue support
   fix(web): correct analytics chart rendering
   docs: update deployment guide
   ```

3. **PR Checklist:**
   - [ ] Tests pass locally
   - [ ] Linting passes
   - [ ] Documentation updated
   - [ ] Breaking changes documented
   - [ ] Related issues linked

4. **Review Process:**
   - At least one approval required
   - All conversations resolved
   - CI checks passing

## Coding Standards

### TypeScript

- Use strict TypeScript
- Prefer `interface` over `type` for object shapes
- Use explicit return types for public functions
- Avoid `any` - use `unknown` if type is truly unknown

```typescript
// Good
interface User {
  id: string;
  name: string;
}

function getUser(id: string): Promise<User | null> {
  // ...
}

// Avoid
type User = { id: string; name: string };
function getUser(id): any {
  // ...
}
```

### Naming Conventions

- Files: `kebab-case.ts`
- Classes: `PascalCase`
- Functions/variables: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- Types/Interfaces: `PascalCase`

### Comments

- Only add comments for non-obvious logic
- Use JSDoc for public APIs
- Keep comments up to date

```typescript
/**
 * Analyzes a pull request for issues.
 * @param pr - The pull request to analyze
 * @param options - Analysis options
 * @returns Analysis result with findings
 */
export async function analyzePullRequest(
  pr: PullRequest,
  options: AnalysisOptions
): Promise<AnalysisResult> {
  // ...
}
```

### Error Handling

- Use custom error classes
- Always handle errors appropriately
- Log errors with context

```typescript
import { PRFlowError, NotFoundError } from '../lib/errors';

async function getWorkflow(id: string): Promise<Workflow> {
  const workflow = await db.workflow.findUnique({ where: { id } });
  if (!workflow) {
    throw new NotFoundError('Workflow', id);
  }
  return workflow;
}
```

## Testing Guidelines

### Test Structure

```typescript
describe('FeatureName', () => {
  describe('methodName', () => {
    it('should do something specific', () => {
      // Arrange
      const input = createTestInput();
      
      // Act
      const result = methodName(input);
      
      // Assert
      expect(result).toEqual(expectedOutput);
    });
  });
});
```

### Test Types

1. **Unit Tests:** Test individual functions/classes
2. **Integration Tests:** Test component interactions
3. **E2E Tests:** Test complete workflows

### Mocking

```typescript
import { vi } from 'vitest';

vi.mock('../lib/github', () => ({
  createGitHubClient: vi.fn().mockReturnValue({
    getPullRequest: vi.fn().mockResolvedValue(mockPR),
  }),
}));
```

## Adding New Features

### 1. Plan

- Open an issue to discuss the feature
- Get feedback from maintainers
- Define acceptance criteria

### 2. Implement

- Create a feature branch
- Write tests first (TDD encouraged)
- Implement the feature
- Update documentation

### 3. Submit

- Create a PR
- Address review feedback
- Squash commits if requested

## Common Tasks

### Adding a New API Endpoint

1. Add route in `apps/api/src/routes/`
2. Add types in `packages/core/src/models/`
3. Add tests in `apps/api/src/__tests__/`
4. Update OpenAPI docs

### Adding a New Agent

1. Create agent in `apps/api/src/agents/`
2. Export from `apps/api/src/agents/index.ts`
3. Add to orchestrator if needed
4. Add tests

### Updating Database Schema

1. Modify `packages/db/prisma/schema.prisma`
2. Create migration: `pnpm db:migrate -- --name your_migration`
3. Update types if needed
4. Add tests

## Getting Help

- **Questions:** Open a GitHub Discussion
- **Bugs:** Open a GitHub Issue
- **Security:** See [SECURITY.md](SECURITY.md) for reporting vulnerabilities

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing! 🙏
