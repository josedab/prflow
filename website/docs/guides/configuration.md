---
sidebar_position: 2
title: Configuration
description: Complete configuration reference for PRFlow
---

# Configuration

PRFlow can be configured through environment variables, a YAML config file, or the TypeScript config file. This page documents all available options.

## Configuration Methods

PRFlow loads configuration in this order (later values override earlier):

1. Default values
2. Environment variables
3. `.github/prflow.yml` (repository config)
4. `prflow.config.ts` (TypeScript config)
5. GitHub Action inputs (when using the action)

---

## Repository Config File

The recommended way to configure PRFlow per-repository:

```yaml title=".github/prflow.yml"
# ===================
# Agent Configuration
# ===================

agents:
  # Analyzer Agent
  analyzer:
    enabled: true
    classify_pr_type: true
    calculate_impact: true
    risk_assessment: true
    suggest_reviewers: true
    max_reviewers: 3
    
    # Custom branch patterns for PR type detection
    branch_prefixes:
      feature: ['feature/', 'feat/']
      bugfix: ['fix/', 'hotfix/', 'bugfix/']
      refactor: ['refactor/']
      docs: ['docs/', 'documentation/']
      chore: ['chore/', 'ci/', 'build/']
      test: ['test/', 'tests/']
      deps: ['deps/', 'dependencies/']
    
    # Files that increase risk level
    sensitive_paths:
      - '**/auth/**'
      - '**/payment/**'
      - '**/.env*'
      - '**/migrations/**'
      - '**/security/**'

  # Reviewer Agent
  reviewer:
    enabled: true
    
    # Categories to check
    security:
      enabled: true
      severity_threshold: low  # Report all security issues
    
    bugs:
      enabled: true
      severity_threshold: medium
    
    performance:
      enabled: true
      severity_threshold: medium
    
    error_handling:
      enabled: true
      severity_threshold: medium
    
    style:
      enabled: false  # Disabled by default (use ESLint/Prettier instead)
    
    # General settings
    min_confidence: 0.7       # Don't report uncertain findings
    max_comments: 25          # Maximum inline comments
    max_suggestions: 10       # Maximum code suggestions
    
    # Patterns to always flag
    custom_patterns:
      - pattern: 'TODO|FIXME|HACK'
        message: 'Unresolved TODO/FIXME/HACK comment'
        severity: low
      - pattern: 'console\.(log|debug|info)'
        message: 'Console statement should be removed'
        severity: low

  # Test Generator Agent
  test_generator:
    enabled: true
    
    # Framework detection (auto, jest, vitest, pytest, go)
    framework: auto
    
    # Test types to generate
    happy_path: true
    edge_cases: true
    error_cases: true
    
    # Output settings
    inline_suggestions: true   # Show in PR comments
    full_file_output: false    # Generate complete test files
    
    # Complexity threshold (skip trivial functions)
    min_function_complexity: 2
    
    # Skip these paths
    ignore_patterns:
      - '**/*.d.ts'
      - '**/types/**'
      - '**/interfaces/**'

  # Documentation Agent
  documentation:
    enabled: true
    
    # JSDoc/docstring settings
    jsdoc:
      enabled: true
      require_public: true      # Only public exports
      require_params: true      # Require @param tags
      require_returns: true     # Require @returns tag
      require_examples: false   # Require @example tags
    
    # README tracking
    readme:
      enabled: true
      track_exports: true       # Flag new public APIs
      track_commands: true      # Flag new CLI commands
    
    # Changelog suggestions
    changelog:
      enabled: true
      format: keepachangelog    # or 'conventional'

# ===================
# Workflow Settings
# ===================

workflow:
  # Execution mode: parallel, sequential, analyzer-first
  execution_mode: parallel
  
  # Timeout in seconds
  timeout: 300
  
  # Retry on failure
  retry:
    enabled: true
    max_attempts: 3
    delay_ms: 5000

# ===================
# Path Filters
# ===================

paths:
  # Only analyze these paths
  include:
    - 'src/**'
    - 'lib/**'
    - 'packages/**'
  
  # Skip these paths
  exclude:
    - '**/node_modules/**'
    - '**/dist/**'
    - '**/build/**'
    - '**/*.min.js'
    - '**/vendor/**'
    - '**/generated/**'
    - '**/*.test.ts'
    - '**/*.spec.ts'
    - '**/__tests__/**'
    - '**/__mocks__/**'

# ===================
# Output Settings
# ===================

outputs:
  # Main PR comment
  summary_comment:
    enabled: true
    template: default          # default, minimal, detailed
    
    sections:
      overview: true
      risk_assessment: true
      key_changes: true
      findings_summary: true
      suggested_reviewers: true
      metrics: true
    
    # Only update existing comment, don't create new
    update_only: false
    
    # Hide comment when no issues found
    hide_when_clean: false

  # Inline review comments
  inline_comments:
    enabled: true
    max_comments: 25
    severity_threshold: medium  # low, medium, high, critical
    use_suggestions: true       # Use GitHub suggestion blocks
    collapse_low_severity: true

  # Check status
  check_status:
    enabled: true
    name: 'PRFlow Analysis'
    
    # What causes check failure
    fail_on:
      critical: true
      high: false
      medium: false
      low: false
    
    # Include summary in check details
    include_summary: true

# ===================
# PR Settings
# ===================

pull_request:
  # Skip draft PRs
  skip_draft: true
  
  # Skip PRs from forks
  skip_forks: false
  
  # Skip PRs with these labels
  skip_labels:
    - 'skip-prflow'
    - 'wip'
    - 'do-not-review'
  
  # Only analyze PRs with these labels (empty = all PRs)
  require_labels: []
  
  # Skip PRs by these authors (bots, etc.)
  skip_authors:
    - 'dependabot[bot]'
    - 'renovate[bot]'
```

---

## TypeScript Config File

For programmatic configuration:

```typescript title="prflow.config.ts"
import { defineConfig } from '@prflow/core';

export default defineConfig({
  agents: {
    analyzer: {
      enabled: true,
      sensitivePaths: [
        '**/auth/**',
        '**/payment/**',
        '**/.env*',
      ],
    },
    
    reviewer: {
      enabled: true,
      severityThreshold: 'medium',
      categories: ['security', 'bug', 'performance', 'error_handling'],
      
      // Custom rules
      customRules: [
        {
          name: 'no-console',
          pattern: /console\.(log|debug|info)/,
          message: 'Remove console statements',
          severity: 'low',
        },
      ],
    },
    
    testGenerator: {
      enabled: true,
      framework: 'vitest',
    },
    
    documentation: {
      enabled: true,
      generateJSDoc: true,
    },
  },
  
  review: {
    maxComments: 25,
    blockOnCritical: true,
    failOnHigh: false,
  },
  
  // Dynamic configuration based on PR
  getConfig: async (pr) => {
    // Stricter rules for main branch
    if (pr.base.ref === 'main') {
      return {
        review: {
          failOnHigh: true,
          severityThreshold: 'low',
        },
      };
    }
    return {};
  },
});
```

---

## Environment Variables

### Core Settings

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment (`development`, `production`) | `development` |
| `PORT` | API server port | `3001` |
| `LOG_LEVEL` | Log level (`debug`, `info`, `warn`, `error`) | `info` |

### Database

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |

**Format:** `postgresql://user:password@host:port/database`

```bash
DATABASE_URL=postgresql://prflow:secret@localhost:5432/prflow
```

### Redis

| Variable | Description | Required |
|----------|-------------|----------|
| `REDIS_URL` | Redis connection string | Yes |

**Format:** `redis://[:password@]host:port[/database]`

```bash
REDIS_URL=redis://localhost:6379
# With password
REDIS_URL=redis://:secret@localhost:6379
```

### GitHub App

| Variable | Description | Required |
|----------|-------------|----------|
| `GITHUB_APP_ID` | GitHub App ID | Yes |
| `GITHUB_APP_PRIVATE_KEY` | Private key (PEM format) | Yes |
| `GITHUB_WEBHOOK_SECRET` | Webhook secret for verification | Yes |
| `GITHUB_CLIENT_ID` | OAuth Client ID (for web login) | No |
| `GITHUB_CLIENT_SECRET` | OAuth Client Secret | No |

**Private key format:**
```bash
# Single line with \n
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----"

# Or use base64
GITHUB_APP_PRIVATE_KEY_BASE64="LS0tLS1CRUdJTi..."
```

### LLM Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `ENABLE_LLM_ANALYSIS` | Use LLM for analysis | `true` |
| `ENABLE_LLM_REVIEW` | Use LLM for code review | `true` |
| `ENABLE_LLM_TESTS` | Use LLM for test generation | `true` |
| `LLM_PROVIDER` | Provider (`openai`, `anthropic`) | `openai` |
| `OPENAI_API_KEY` | OpenAI API key | - |
| `ANTHROPIC_API_KEY` | Anthropic API key | - |
| `LLM_MODEL` | Model to use | `gpt-4-turbo` |
| `LLM_MAX_TOKENS` | Max tokens per request | `4096` |
| `LLM_TEMPERATURE` | Sampling temperature | `0.1` |

### Session & Security

| Variable | Description | Required |
|----------|-------------|----------|
| `SESSION_SECRET` | Secret for session encryption | Yes (prod) |
| `CORS_ORIGINS` | Allowed CORS origins | `*` |

### Rate Limiting

| Variable | Description | Default |
|----------|-------------|---------|
| `RATE_LIMIT_MAX` | Max requests per window | `100` |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window (ms) | `60000` |

### Workflow Settings

| Variable | Description | Default |
|----------|-------------|---------|
| `WORKFLOW_TIMEOUT_MS` | Max workflow duration | `300000` |
| `WORKFLOW_MAX_RETRIES` | Retry attempts on failure | `3` |
| `WORKFLOW_RETRY_DELAY_MS` | Initial retry delay | `5000` |

---

## Severity Levels

| Level | Description | Default Action |
|-------|-------------|----------------|
| `critical` | Security vulnerabilities, data loss, crashes | Block PR |
| `high` | Significant bugs, major issues | Configurable |
| `medium` | Performance, error handling, minor bugs | Report only |
| `low` | Best practices, minor improvements | Report only |
| `nitpick` | Style, suggestions | Report only |

### Configuring Failure Thresholds

```yaml
# .github/prflow.yml
outputs:
  check_status:
    fail_on:
      critical: true    # Always fail on critical
      high: true        # Also fail on high severity
      medium: false     # Don't fail on medium
      low: false        # Don't fail on low
```

---

## Review Categories

| Category | What it checks |
|----------|----------------|
| `security` | SQL injection, XSS, hardcoded secrets, auth issues, insecure crypto |
| `bug` | Null dereference, logic errors, race conditions, type errors |
| `performance` | N+1 queries, memory leaks, blocking I/O, unnecessary computation |
| `error_handling` | Empty catch, unhandled promises, missing error boundaries |
| `style` | Naming conventions, formatting, code organization |
| `maintainability` | Code duplication, complexity, coupling |
| `testing` | Missing tests, test quality, coverage |
| `documentation` | Missing docs, outdated comments |

### Enable/Disable Categories

```yaml
agents:
  reviewer:
    security:
      enabled: true
    bugs:
      enabled: true
    performance:
      enabled: true
    error_handling:
      enabled: true
    style:
      enabled: false  # Disable style checks
```

---

## Configuration Examples

### Minimal (Getting Started)

```yaml title=".github/prflow.yml"
agents:
  analyzer:
    enabled: true
  reviewer:
    enabled: true
    max_comments: 10
  test_generator:
    enabled: false
  documentation:
    enabled: false
```

### Security-Focused

```yaml title=".github/prflow.yml"
agents:
  analyzer:
    enabled: true
    risk_assessment: true
    sensitive_paths:
      - '**/*auth*/**'
      - '**/*secret*/**'
      - '**/*password*/**'
      - '**/*credential*/**'
  
  reviewer:
    enabled: true
    security:
      enabled: true
      severity_threshold: low
    bugs:
      enabled: true
    performance:
      enabled: false
    style:
      enabled: false

outputs:
  check_status:
    fail_on:
      critical: true
      high: true
```

### Full Featured

```yaml title=".github/prflow.yml"
agents:
  analyzer:
    enabled: true
    classify_pr_type: true
    calculate_impact: true
    risk_assessment: true
    suggest_reviewers: true

  reviewer:
    enabled: true
    security:
      enabled: true
    bugs:
      enabled: true
    performance:
      enabled: true
    error_handling:
      enabled: true
    max_comments: 25

  test_generator:
    enabled: true
    framework: auto
    happy_path: true
    edge_cases: true
    error_cases: true

  documentation:
    enabled: true
    jsdoc:
      enabled: true
    changelog:
      enabled: true

outputs:
  summary_comment:
    enabled: true
    sections:
      overview: true
      risk_assessment: true
      key_changes: true
      findings_summary: true
      suggested_reviewers: true
      metrics: true
  
  inline_comments:
    enabled: true
    max_comments: 25
    use_suggestions: true
  
  check_status:
    enabled: true
    fail_on:
      critical: true
      high: false
```

---

## Next Steps

- [**GitHub Action**](/docs/guides/github-action) — CI/CD setup
- [**Self-Hosting**](/docs/guides/self-hosting) — Deploy your own instance
- [**Agents**](/docs/concepts/agents) — Understand agent capabilities
