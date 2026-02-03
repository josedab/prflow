---
sidebar_position: 2
title: Quick Start
description: Get your first automated PR review in under 5 minutes
---

# Quick Start

Get automated PR reviews in under 5 minutes. No account required.

## 1. Add the Workflow File

Create `.github/workflows/prflow.yml`:

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
      - uses: prflow/action@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

Commit and push:

```bash
git add .github/workflows/prflow.yml
git commit -m "ci: add PRFlow"
git push
```

## 2. Create a Test PR

Let's trigger PRFlow with a real change. Create a branch:

```bash
git checkout -b test/prflow-demo
```

Add a file with some intentional issues for PRFlow to find:

```typescript title="src/demo.ts"
// PRFlow will detect issues in this code

export function processUserData(userId: string) {
  // Security issue: SQL injection
  const query = `SELECT * FROM users WHERE id = '${userId}'`;
  
  // Bug: No null check before accessing length
  const data = fetchData(userId);
  if (data.items.length > 0) {
    return data.items;
  }
  
  // Error handling: Empty catch block
  try {
    return parseData(data);
  } catch (e) {
  }
}

export function calculateDiscount(price: number, discount: number) {
  // Bug: Division without checking for zero
  return price / discount;
}
```

Commit and push:

```bash
git add src/demo.ts
git commit -m "feat: add user data processing"
git push -u origin test/prflow-demo
```

## 3. Open the Pull Request

Go to GitHub and create a PR from `test/prflow-demo` to your main branch.

Within 30-60 seconds, PRFlow will:

1. **Run analysis** — Understand what changed
2. **Post a check** — Shows pass/fail status
3. **Comment on the PR** — Summary of findings
4. **Add inline comments** — Specific issues with fixes

## What You'll See

### Check Status

PRFlow creates a check run on your PR:

```
✓ PRFlow Analysis
  Risk Level: High
  Issues Found: 4
  Type: Feature
```

### PR Summary Comment

A top-level comment with the analysis:

```markdown
## PRFlow Analysis

**PR Type:** Feature
**Risk Level:** 🔴 High
**Files Changed:** 1
**Lines:** +25 / -0

### Summary

This PR adds user data processing functionality. Several security
and reliability issues were detected that should be addressed
before merging.

### Issues Found

| Severity | Category | Count |
|----------|----------|-------|
| 🔴 Critical | Security | 1 |
| 🟠 High | Bug | 2 |
| 🟡 Medium | Error Handling | 1 |

### Suggested Reviewers

- @security-team (security-sensitive changes)
```

### Inline Comments

PRFlow comments directly on problematic lines:

```markdown
🔴 **Critical: SQL Injection Vulnerability**

User input is interpolated directly into a SQL query. This allows
attackers to execute arbitrary SQL commands.

**File:** src/demo.ts:6
**Category:** Security

**Suggested Fix:**
Use parameterized queries instead:

\`\`\`typescript
const query = 'SELECT * FROM users WHERE id = $1';
const result = await db.query(query, [userId]);
\`\`\`
```

### Generated Tests

For new functions, PRFlow suggests tests:

```markdown
🧪 **Suggested Tests for `calculateDiscount`**

\`\`\`typescript
describe('calculateDiscount', () => {
  it('calculates discount correctly', () => {
    expect(calculateDiscount(100, 10)).toBe(10);
    expect(calculateDiscount(50, 25)).toBe(2);
  });

  it('handles zero discount', () => {
    // This will expose the division by zero bug
    expect(calculateDiscount(100, 0)).toBe(Infinity);
  });

  it('handles negative values', () => {
    expect(calculateDiscount(-100, 10)).toBe(-10);
  });
});
\`\`\`
```

## 4. Configure to Your Needs

### Adjust Severity Threshold

Only report medium and above:

```yaml
- uses: prflow/action@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    severity-threshold: medium
```

### Enable/Disable Features

```yaml
- uses: prflow/action@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    review-enabled: true      # Code review
    test-generation: true     # Test suggestions
    doc-updates: false        # Skip doc generation
```

### Block on Critical Issues

Fail the check if critical issues are found:

```yaml
- uses: prflow/action@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    block-on-critical: true
    fail-on-high: true
```

### Ignore Paths

Skip certain files or directories:

```yaml
- uses: prflow/action@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    ignore-paths: "dist/**,*.min.js,vendor/**,**/*.generated.ts"
```

## 5. Clean Up

Once you've seen PRFlow in action, clean up the test:

```bash
git checkout main
git branch -D test/prflow-demo
git push origin --delete test/prflow-demo
```

---

## Next Steps

- [**GitHub Action Reference**](/docs/guides/github-action) — All configuration options
- [**GitHub App Setup**](/docs/getting-started/github-app-setup) — Advanced features
- [**Architecture**](/docs/concepts/architecture) — How PRFlow works
