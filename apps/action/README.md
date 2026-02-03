# PRFlow GitHub Action

Automated AI-powered pull request analysis directly in your GitHub workflow.

## Features

- **Automated Code Review**: AI-powered analysis on every PR
- **Security Scanning**: Detect SQL injection, XSS, hardcoded secrets
- **Bug Detection**: Find empty catch blocks, null pointer issues, race conditions
- **Check Run Integration**: Results appear as GitHub check status
- **Inline Comments**: Post review comments on problematic lines
- **Configurable Severity**: Set thresholds for blocking PRs
- **Dry Run Mode**: Test without posting comments
- **Path Filtering**: Ignore specific directories or files

## Quick Start

Add to your workflow file (`.github/workflows/prflow.yml`):

```yaml
name: PRFlow Analysis

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  pull-requests: write
  checks: write

jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: PRFlow Analysis
        uses: prflow/action@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `github-token` | Yes | - | GitHub token for API access |
| `prflow-token` | No | - | PRFlow API token (for advanced features) |
| `review-enabled` | No | `true` | Enable code review comments |
| `test-generation` | No | `false` | Generate test suggestions |
| `doc-updates` | No | `false` | Suggest documentation updates |
| `severity-threshold` | No | `medium` | Minimum severity to report (`critical`, `high`, `medium`, `low`, `nitpick`) |
| `auto-fix-style` | No | `false` | Auto-fix style issues |
| `block-on-critical` | No | `true` | Fail check on critical issues |
| `fail-on-high` | No | `false` | Fail check on high severity issues |
| `ignore-paths` | No | - | Comma-separated paths to ignore |
| `comment-on-pr` | No | `true` | Post summary comment on PR |
| `max-comments` | No | `25` | Maximum number of inline comments |
| `dry-run` | No | `false` | Run analysis without posting results |

## Outputs

| Output | Description |
|--------|-------------|
| `analysis-summary` | Brief summary of analysis results |
| `issues-found` | Total number of issues detected |
| `tests-generated` | Number of test suggestions |
| `critical-count` | Number of critical issues |
| `high-count` | Number of high severity issues |
| `medium-count` | Number of medium severity issues |
| `risk-level` | Overall risk assessment (`low`, `medium`, `high`, `critical`) |
| `pr-type` | Detected PR type (`feature`, `bugfix`, `refactor`, `docs`, `test`, `chore`) |
| `check-run-id` | ID of the created check run |

## Usage Examples

### Basic Analysis

```yaml
- name: PRFlow Analysis
  uses: prflow/action@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Block on Critical Issues

```yaml
- name: PRFlow Analysis
  uses: prflow/action@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    block-on-critical: true
    fail-on-high: true
```

### Custom Severity Threshold

Only report high and critical issues:

```yaml
- name: PRFlow Analysis
  uses: prflow/action@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    severity-threshold: high
```

### Ignore Vendor and Generated Files

```yaml
- name: PRFlow Analysis
  uses: prflow/action@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    ignore-paths: vendor/,generated/,*.min.js
```

### Dry Run for Testing

```yaml
- name: PRFlow Analysis (Dry Run)
  uses: prflow/action@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    dry-run: true
```

### With Test Generation

```yaml
- name: PRFlow Analysis
  uses: prflow/action@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    test-generation: true
    doc-updates: true
```

### Using Outputs

```yaml
- name: PRFlow Analysis
  id: prflow
  uses: prflow/action@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}

- name: Check Results
  run: |
    echo "Issues found: ${{ steps.prflow.outputs.issues-found }}"
    echo "Risk level: ${{ steps.prflow.outputs.risk-level }}"
    echo "PR type: ${{ steps.prflow.outputs.pr-type }}"

- name: Fail if Too Many Issues
  if: steps.prflow.outputs.issues-found > 10
  run: exit 1
```

### Matrix Testing with Different Thresholds

```yaml
jobs:
  analyze:
    strategy:
      matrix:
        severity: [critical, high, medium]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: prflow/action@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          severity-threshold: ${{ matrix.severity }}
```

## Check Run Results

The action creates a GitHub Check Run with detailed results:

### Status

| Check Status | Condition |
|--------------|-----------|
| Success | No issues found |
| Neutral | Issues found but none critical (or `block-on-critical: false`) |
| Failure | Critical issues found and `block-on-critical: true` |

### Output Format

```markdown
## PRFlow Analysis

### PR Overview
- **Title:** Add user authentication
- **Type:** feature
- **Branch:** feat/auth
- **Files Changed:** 12
- **Lines:** +450 / -23
- **Risk Level:** medium

### Findings
| Severity | Count |
|----------|-------|
| 🔴 Critical | 0 |
| 🟠 High | 2 |
| 🟡 Medium | 5 |
| 🔵 Low | 3 |
| ✨ Nitpick | 1 |

**Total Issues:** 11
```

## Inline Comments

When `review-enabled: true`, the action posts inline review comments:

```markdown
🔴 **Critical: Potential SQL Injection**

User input appears to be interpolated into SQL query. Use parameterized queries.
```

Comments are posted on the specific lines where issues are detected, making it easy to locate and fix problems.

## Detected Issues

### Critical Severity

- **SQL Injection**: Template strings in SQL queries
- **Hardcoded Secrets**: Passwords, API keys, tokens in source code
- **Command Injection**: Unsanitized user input in shell commands

### High Severity

- **Empty Catch Blocks**: Swallowed exceptions
- **XSS Vulnerabilities**: Unescaped user content in HTML
- **Authentication Bypass**: Missing auth checks

### Medium Severity

- **Console Statements**: Debug logging in production code
- **TODO/FIXME Comments**: Unresolved work items
- **Deprecated APIs**: Usage of outdated functions

### Low Severity

- **Long Functions**: Complexity indicators
- **Magic Numbers**: Unexplained numeric literals
- **Missing Type Annotations**: TypeScript type safety

## PR Type Detection

The action automatically detects PR type from branch name and title:

| Pattern | Detected Type |
|---------|---------------|
| `fix/*`, `bug/*`, "fix:", "bug:" | `bugfix` |
| `feat/*`, `feature/*`, "feat:", "add:" | `feature` |
| `refactor/*`, "refactor:" | `refactor` |
| `doc/*`, `docs/*`, "doc:" | `docs` |
| `test/*`, "test:" | `test` |
| `chore/*`, `deps/*`, "chore:" | `chore` |

## Risk Level Calculation

Risk level is calculated based on:

| Condition | Risk Level |
|-----------|------------|
| Any critical issues | `critical` |
| > 2 high issues | `high` |
| Any high OR > 5 medium | `medium` |
| > 500 lines changed | `medium` |
| > 20 files changed | `medium` |
| Otherwise | `low` |

## Required Permissions

```yaml
permissions:
  contents: read       # Read repository files
  pull-requests: write # Post PR comments
  checks: write        # Create check runs
```

## Development

### Setup

```bash
cd apps/action
pnpm install
```

### Build

```bash
pnpm build
```

The action is bundled using `@vercel/ncc` for single-file distribution.

### Testing Locally

```bash
# Set required environment variables
export GITHUB_TOKEN="your-token"
export GITHUB_REPOSITORY="owner/repo"
export GITHUB_EVENT_NAME="pull_request"
export GITHUB_EVENT_PATH="/path/to/event.json"

# Run the action
node dist/index.js
```

### Linting

```bash
pnpm lint
```

## Troubleshooting

### Check run not created
- Verify `checks: write` permission is granted
- Ensure `dry-run` is not enabled
- Check action logs for errors

### Comments not posted
- Verify `pull-requests: write` permission
- Ensure `review-enabled: true`
- Check `max-comments` limit hasn't been reached

### Token permissions error
- Use `${{ secrets.GITHUB_TOKEN }}` for automatic token
- For fine-grained PAT, ensure proper repository access

### Action only runs on first commit
- Add `synchronize` to trigger events:
  ```yaml
  on:
    pull_request:
      types: [opened, synchronize, reopened]
  ```

## Related

- [PRFlow Documentation](../../README.md)
- [PRFlow API Reference](../../docs/API.md)
- [VS Code Extension](../../extensions/vscode-prflow/README.md)
