---
sidebar_position: 1
title: Contributing
description: How to contribute to PRFlow
---

# Contributing to PRFlow

Thank you for your interest in contributing! PRFlow is an open-source project and we welcome contributions from the community.

## Ways to Contribute

| Type | Description | Great For |
|------|-------------|-----------|
| 🐛 **Bug Reports** | Found something broken? [Open an issue](https://github.com/josedab/prflow/issues) | Everyone |
| 💡 **Feature Ideas** | Have a suggestion? [Start a discussion](https://github.com/josedab/prflow/discussions) | Everyone |
| 📖 **Documentation** | Fix typos, add examples, improve clarity | First-timers |
| 🔧 **Code Changes** | Bug fixes, features, performance | Developers |
| 🧪 **Testing** | Add tests, improve coverage | Developers |
| 🎨 **Design** | UI/UX improvements for dashboard | Designers |

---

## Code of Conduct

We're committed to a welcoming and inclusive community:

- **Be respectful** — Treat everyone with respect and kindness
- **Be constructive** — Focus on the problem, not the person
- **Be patient** — Not everyone has the same experience level
- **Be collaborative** — We're all working toward the same goal

Full [Code of Conduct](https://github.com/josedab/prflow/blob/main/CODE_OF_CONDUCT.md) on GitHub.

---

## Getting Started

### 1. Find Something to Work On

**Good first issues:**
- [Label: `good first issue`](https://github.com/josedab/prflow/labels/good%20first%20issue) — Beginner-friendly
- [Label: `help wanted`](https://github.com/josedab/prflow/labels/help%20wanted) — Looking for contributors
- [Label: `documentation`](https://github.com/josedab/prflow/labels/documentation) — Docs improvements

**Or propose something new:**
- Open a discussion for feature ideas
- Open an issue for bugs

### 2. Fork and Clone

```bash
# Fork on GitHub first, then:
git clone https://github.com/YOUR_USERNAME/prflow.git
cd prflow

# Add upstream remote
git remote add upstream https://github.com/josedab/prflow.git
```

### 3. Set Up Development Environment

See [Development Setup](/docs/contributing/development-setup) for detailed instructions.

```bash
# Quick start
pnpm install
docker compose -f docker/docker-compose.yml up -d
cp .env.example .env
pnpm db:migrate
pnpm dev
```

### 4. Create a Branch

```bash
# Update main
git checkout main
git pull upstream main

# Create feature branch
git checkout -b feature/your-feature-name

# Or bug fix branch
git checkout -b fix/issue-description
```

**Branch naming:**
- `feature/description` — New features
- `fix/description` — Bug fixes
- `docs/description` — Documentation
- `refactor/description` — Code refactoring
- `test/description` — Adding tests

### 5. Make Your Changes

- Write clean, readable code
- Follow existing code style
- Add tests for new functionality
- Update documentation if needed

### 6. Test Your Changes

```bash
# Run all tests
pnpm test

# Run linting
pnpm lint

# Build to check for type errors
pnpm build
```

### 7. Commit Your Changes

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```bash
# Format: type(scope): description

# Features
git commit -m "feat(api): add merge queue support"

# Bug fixes
git commit -m "fix(web): correct analytics chart rendering"

# Documentation
git commit -m "docs: update deployment guide"

# Tests
git commit -m "test(reviewer): add edge case tests"

# Refactoring
git commit -m "refactor(core): simplify agent orchestration"
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`

**Scopes:** `api`, `web`, `action`, `core`, `db`, `config`, or omit for broad changes

### 8. Push and Create PR

```bash
git push origin feature/your-feature-name
```

Then open a Pull Request on GitHub.

---

## Pull Request Guidelines

### PR Title Format

```
type(scope): brief description

Examples:
feat(api): add webhook retry mechanism
fix(reviewer): handle empty diff gracefully
docs: add self-hosting troubleshooting guide
```

### PR Description Template

```markdown
## Summary
Brief description of what this PR does.

## Changes
- Added X
- Modified Y
- Fixed Z

## Testing
- [ ] Unit tests pass
- [ ] Manual testing completed
- [ ] Documentation updated

## Related Issues
Fixes #123
Relates to #456
```

### PR Checklist

Before submitting:

- [ ] Tests pass locally (`pnpm test`)
- [ ] Linting passes (`pnpm lint`)
- [ ] Build succeeds (`pnpm build`)
- [ ] Documentation updated (if applicable)
- [ ] Breaking changes documented
- [ ] Related issues linked
- [ ] PR title follows convention

### Review Process

1. **Automated checks** — CI runs tests, linting, build
2. **Code review** — At least one maintainer approval required
3. **Conversations** — All comments must be resolved
4. **Merge** — Squash merge into main

**Review timeline:**
- Simple fixes: 1-2 days
- Features: 3-5 days
- Major changes: May require discussion

---

## Issue Guidelines

### Bug Reports

Use the bug report template:

```markdown
**Describe the bug**
A clear description of what's broken.

**To Reproduce**
1. Go to '...'
2. Click on '...'
3. See error

**Expected behavior**
What should happen instead.

**Environment**
- PRFlow version: [e.g. 1.0.0]
- Node.js version: [e.g. 20.10.0]
- OS: [e.g. Ubuntu 22.04]

**Additional context**
Error messages, screenshots, logs.
```

### Feature Requests

Use the feature request template:

```markdown
**Is this related to a problem?**
Describe what you're trying to accomplish.

**Describe the solution**
What you'd like to happen.

**Alternatives considered**
Other approaches you've thought about.

**Additional context**
Mockups, examples, use cases.
```

---

## Development Guidelines

### Code Style

PRFlow uses:
- **TypeScript** with strict mode
- **ESLint** for linting
- **Prettier** for formatting

```bash
# Format code
pnpm format

# Check linting
pnpm lint

# Fix auto-fixable issues
pnpm lint -- --fix
```

### TypeScript Conventions

```typescript
// ✅ Use explicit return types for public functions
export function analyzeCode(code: string): AnalysisResult {
  // ...
}

// ✅ Prefer interfaces over type aliases for objects
interface User {
  id: string;
  name: string;
}

// ✅ Use unknown instead of any when type is truly unknown
function parseJson(json: string): unknown {
  return JSON.parse(json);
}

// ✅ Use const assertions for literal types
const STATUS = {
  pending: 'pending',
  completed: 'completed',
} as const;
```

### Testing Guidelines

```typescript
// Follow Arrange-Act-Assert pattern
describe('AnalyzerAgent', () => {
  // Use descriptive test names
  it('should classify feature PR when branch starts with feature/', async () => {
    // Arrange
    const diff = createMockDiff({ branch: 'feature/new-login' });
    const agent = new AnalyzerAgent();
    
    // Act
    const result = await agent.execute(diff, mockContext);
    
    // Assert
    expect(result.data.type).toBe('feature');
  });

  // Test edge cases
  it('should handle empty diff gracefully', async () => {
    const diff = createMockDiff({ files: [] });
    const agent = new AnalyzerAgent();
    
    const result = await agent.execute(diff, mockContext);
    
    expect(result.success).toBe(true);
    expect(result.data.type).toBe('chore');
  });

  // Test error cases
  it('should return error result when GitHub API fails', async () => {
    const diff = createMockDiff();
    const agent = new AnalyzerAgent();
    mockGitHubClient.getDiff.mockRejectedValue(new Error('API error'));
    
    const result = await agent.execute(diff, mockContext);
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('API error');
  });
});
```

### Documentation

- Update docs when adding features
- Include code examples
- Explain the "why", not just the "what"

---

## Project Architecture

Quick overview for new contributors:

```
prflow/
├── apps/
│   ├── api/                # Fastify REST API
│   │   ├── src/
│   │   │   ├── agents/     # AI agents (analyzer, reviewer, etc.)
│   │   │   ├── routes/     # API endpoints
│   │   │   ├── services/   # Business logic
│   │   │   └── workers/    # Background job processors
│   │   └── __tests__/
│   │
│   ├── web/                # Next.js dashboard
│   │   ├── src/
│   │   │   ├── app/        # App router pages
│   │   │   ├── components/ # React components
│   │   │   └── lib/        # Utilities
│   │   └── __tests__/
│   │
│   └── action/             # GitHub Action
│
├── packages/
│   ├── core/               # Shared types, utilities, base classes
│   ├── db/                 # Prisma client, migrations
│   ├── github-client/      # GitHub API wrapper
│   └── config/             # Configuration schemas
│
├── docker/                 # Docker configurations
└── website/                # Documentation (Docusaurus)
```

---

## Communication

| Channel | Use For |
|---------|---------|
| [GitHub Issues](https://github.com/josedab/prflow/issues) | Bug reports, tracked tasks |
| [GitHub Discussions](https://github.com/josedab/prflow/discussions) | Questions, ideas, help |
| [Pull Requests](https://github.com/josedab/prflow/pulls) | Code review |

### Getting Help

Stuck on something?

1. Check existing issues and discussions
2. Search the documentation
3. Ask in GitHub Discussions (tag with `help wanted`)

We're happy to help contributors succeed!

---

## Recognition

Contributors are recognized in:
- `CONTRIBUTORS.md` file
- Release notes
- README acknowledgments

---

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](https://github.com/josedab/prflow/blob/main/LICENSE).

---

## Next Steps

- [**Development Setup**](/docs/contributing/development-setup) — Set up your environment
- [**Architecture**](/docs/concepts/architecture) — Understand the system
- [**API Reference**](/docs/api-reference) — Explore the API
