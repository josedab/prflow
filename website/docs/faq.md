---
sidebar_position: 101
title: FAQ
description: Frequently asked questions about PRFlow
---

# Frequently Asked Questions

## General

### What is PRFlow?

PRFlow is an intelligent pull request automation platform. It uses AI-powered agents to:

- **Analyze** PRs to understand what changed and assess risk
- **Review** code for bugs, security issues, and best practices
- **Generate** tests for new and modified code
- **Update** documentation to stay in sync with code

Think of it as an AI teammate that handles the 70% of code review that's mechanical—so humans can focus on architecture and business logic.

### Is PRFlow free?

| Use Case | Cost |
|----------|------|
| Public repositories (GitHub Action) | Free |
| Private repositories (GitHub Action) | Free tier + paid plans |
| Self-hosted | Free (open source) |

### Does PRFlow replace human reviewers?

**No.** PRFlow is designed to **augment** humans, not replace them.

**What PRFlow handles:**
- Style and formatting issues
- Obvious bugs (null checks, off-by-one errors)
- Security anti-patterns
- Missing tests
- Documentation gaps

**What humans do better:**
- Architecture decisions
- Business logic validation
- UX and product concerns
- Context-specific tradeoffs
- Final approval and merge

PRFlow reduces reviewer fatigue and catches issues before human review begins.

### What languages does PRFlow support?

| Support Level | Languages |
|---------------|-----------|
| **Full** | TypeScript, JavaScript, Python, Go |
| **Good** | Java, Rust, C#, Ruby |
| **Basic** | PHP, Kotlin, Swift, C/C++ |

Code patterns (security issues, error handling) are detected across all languages. Language-specific features (test generation style, frameworks) vary by support level.

### How does PRFlow compare to Copilot, CodeRabbit, etc.?

| Feature | PRFlow | Copilot | CodeRabbit |
|---------|--------|---------|------------|
| Code generation | ❌ | ✅ | ❌ |
| PR review | ✅ | Limited | ✅ |
| Test generation | ✅ | ❌ | ❌ |
| Self-hosted option | ✅ | ❌ | ❌ |
| Custom agents | ✅ | ❌ | ❌ |
| Open source | ✅ | ❌ | ❌ |

PRFlow focuses specifically on the PR review workflow with specialized agents for different tasks.

---

## Installation & Setup

### How do I install PRFlow?

**Quickest way (GitHub Action):**

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

See [Installation Guide](/docs/getting-started/installation) for more options.

### Does PRFlow work with private repositories?

Yes. The GitHub Action works with both public and private repositories. Your code is analyzed within the GitHub Actions runner—it's not sent to external servers unless you enable LLM features.

### Does PRFlow work with forks?

By default, yes. For security-sensitive repos, you can disable fork analysis:

```yaml
- uses: prflow/action@v1
  with:
    skip-forks: true
```

:::warning
Analyzing fork PRs exposes your analysis to external contributors. Review security implications for your use case.
:::

### Can I use PRFlow with GitLab or Bitbucket?

Currently, PRFlow only supports GitHub. GitLab and Bitbucket support is on the roadmap.

---

## Configuration

### How do I configure PRFlow?

Three methods (in order of precedence):

1. **GitHub Action inputs** — Per-workflow settings
2. **`.github/prflow.yml`** — Repository-level config
3. **Environment variables** — Self-hosted settings

See [Configuration Guide](/docs/guides/configuration) for all options.

### Can I ignore certain files or paths?

Yes, use the `ignore-paths` input or config:

```yaml
# In workflow
- uses: prflow/action@v1
  with:
    ignore-paths: "dist/**,*.min.js,vendor/**,node_modules/**"

# In .github/prflow.yml
paths:
  exclude:
    - '**/dist/**'
    - '**/*.min.js'
    - '**/vendor/**'
    - '**/generated/**'
```

### How do I reduce comment noise?

Several approaches:

```yaml
# Limit number of comments
max-comments: 10

# Only report serious issues
severity-threshold: high

# Disable certain agents
test-generation: false
doc-updates: false
```

### Can I have different settings for different branches?

Yes, use conditional workflows:

```yaml
jobs:
  prflow-main:
    if: github.base_ref == 'main'
    steps:
      - uses: prflow/action@v1
        with:
          severity-threshold: low
          fail-on-high: true

  prflow-develop:
    if: github.base_ref == 'develop'
    steps:
      - uses: prflow/action@v1
        with:
          severity-threshold: medium
          fail-on-high: false
```

---

## Review Quality

### Why did PRFlow flag a false positive?

AI analysis isn't perfect. When you see a false positive:

1. **Dismiss it** — Use the "Resolve" button on GitHub
2. **Adjust configuration** — Increase `severity-threshold` or `min_confidence`
3. **Add to ignore patterns** — For specific file types or paths
4. **Report it** — Help improve detection by opening an issue

```yaml
# Reduce false positives
agents:
  reviewer:
    min_confidence: 0.8  # Only high-confidence findings
    severity_threshold: medium
```

### How accurate is PRFlow's analysis?

Accuracy varies by detection type:

| Category | Precision | Recall |
|----------|-----------|--------|
| Security (pattern-based) | ~95% | ~80% |
| Security (LLM-enhanced) | ~90% | ~90% |
| Bug detection | ~85% | ~75% |
| Performance issues | ~80% | ~70% |

Higher confidence thresholds improve precision at the cost of recall.

### Can PRFlow detect all security issues?

No. PRFlow catches common issues:

- ✅ SQL injection
- ✅ XSS vulnerabilities
- ✅ Hardcoded secrets
- ✅ Insecure configurations
- ✅ Missing authentication
- ⚠️ Complex business logic vulnerabilities
- ❌ Zero-day exploits
- ❌ Infrastructure security

For comprehensive security, combine PRFlow with:
- SAST tools (Semgrep, CodeQL)
- DAST tools (OWASP ZAP)
- Dependency scanners (Dependabot, Snyk)
- Penetration testing

### Can I customize the review rules?

Yes, via custom patterns:

```yaml
agents:
  reviewer:
    custom_patterns:
      - pattern: 'TODO|FIXME|HACK'
        message: 'Unresolved TODO comment'
        severity: low
      
      - pattern: 'console\.(log|debug|info)'
        message: 'Remove console statement'
        severity: low
```

Advanced custom agents are also supported for complex rules.

---

## Self-Hosting

### Can I run PRFlow on my own servers?

Yes! PRFlow is fully open source and can be self-hosted. See [Self-Hosting Guide](/docs/guides/self-hosting).

Benefits:
- Complete data control
- Regulatory compliance
- Custom modifications
- No usage limits

### What are the system requirements?

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| CPU | 2 cores | 4 cores |
| RAM | 2 GB | 4 GB |
| Storage | 10 GB | 20 GB |
| PostgreSQL | 14+ | 15+ |
| Redis | 7+ | 7+ |
| Node.js | 20+ | 20 LTS |

### Is my code sent to external servers?

| Deployment | Code Handling |
|------------|---------------|
| **GitHub Action** | Analyzed in your GitHub Actions runner |
| **Self-hosted** | All processing on your infrastructure |
| **LLM features** | Code snippets sent to OpenAI/Anthropic |

To keep all data internal, disable LLM features:

```bash
ENABLE_LLM_ANALYSIS=false
ENABLE_LLM_REVIEW=false
ENABLE_LLM_TESTS=false
```

---

## Privacy & Security

### Does PRFlow store my code?

PRFlow stores **minimal metadata**:
- Repository names
- PR numbers and titles
- Analysis results (issues found, severity counts)
- Configuration settings

**Not stored:**
- Full source code
- Diff contents (after processing)
- File contents

For self-hosted deployments, you control all data storage.

### What permissions does PRFlow need?

| Permission | Why |
|------------|-----|
| `contents: read` | Read repository files for analysis |
| `pull-requests: write` | Post comments on PRs |
| `checks: write` | Create check run status |

PRFlow doesn't need:
- Push access
- Admin access
- Access to other repositories

### Is PRFlow SOC 2 / HIPAA compliant?

For enterprise deployments requiring compliance certifications, self-hosting gives you full control over:
- Data storage location
- Access controls
- Audit logging
- Encryption

Contact us for enterprise compliance documentation.

### How do I report a security vulnerability?

**Do not open a public issue.** Instead:

1. Email: security@prflow.dev
2. Or use [GitHub Security Advisories](https://github.com/josedab/prflow/security/advisories)

See [SECURITY.md](https://github.com/josedab/prflow/blob/main/SECURITY.md) for our responsible disclosure policy.

---

## Integration

### Can I integrate PRFlow with Slack/Teams/Discord?

Yes, via webhooks:

```yaml
# .github/prflow.yml
webhooks:
  url: https://your-webhook-endpoint.com
  events:
    - workflow.completed
    - issue.critical
```

Then translate webhook payloads to your messaging platform.

### Does PRFlow work with monorepos?

Yes. Use path filters to analyze specific packages:

```yaml
jobs:
  prflow-api:
    steps:
      - uses: prflow/action@v1
        with:
          include-paths: "packages/api/**"

  prflow-web:
    steps:
      - uses: prflow/action@v1
        with:
          include-paths: "packages/web/**"
```

### Can I trigger PRFlow manually?

Yes, add `workflow_dispatch`:

```yaml
on:
  pull_request:
    types: [opened, synchronize]
  workflow_dispatch:
    inputs:
      pr-number:
        description: 'PR number to analyze'
        required: true
```

Or use PR comments:
```
/prflow review
```

---

## Pricing & Limits

### What are the rate limits?

| Plan | Requests/minute | PRs/month |
|------|-----------------|-----------|
| Free (public repos) | 60 | Unlimited |
| Free (private repos) | 60 | 100 |
| Pro | 300 | Unlimited |
| Self-hosted | Unlimited | Unlimited |

### Is there a limit on PR size?

Default limits:

| Metric | Limit |
|--------|-------|
| Files changed | 100 |
| Lines changed | 10,000 |
| Diff size | 1 MB |

Configurable for self-hosted deployments.

---

## Contributing

### How can I contribute to PRFlow?

See [Contributing Guide](/docs/contributing/overview). Ways to help:

- 🐛 Report bugs
- 💡 Suggest features
- 📖 Improve documentation
- 🔧 Submit code changes
- 🧪 Add tests

### Is PRFlow open source?

Yes! PRFlow is licensed under MIT. You can:
- Use it for any purpose
- Modify it
- Distribute it
- Use it commercially

See [LICENSE](https://github.com/josedab/prflow/blob/main/LICENSE).

---

## Still Have Questions?

- 📖 [Full Documentation](/)
- 💬 [GitHub Discussions](https://github.com/josedab/prflow/discussions)
- 🐛 [GitHub Issues](https://github.com/josedab/prflow/issues)
- 📧 [Contact: support@prflow.dev](mailto:support@prflow.dev)
