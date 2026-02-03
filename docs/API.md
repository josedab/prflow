# PRFlow API Reference

Complete API reference for the PRFlow platform. Base URL: `http://localhost:3001/api`

## Table of Contents

- [Authentication](#authentication)
- [Health & Status](#health--status)
- [Repositories](#repositories)
- [Workflows](#workflows)
- [Analytics](#analytics)
- [Fixes](#fixes)
- [Merge Queue](#merge-queue)
- [Knowledge Graph](#knowledge-graph)
- [Compliance](#compliance)
- [Technical Debt](#technical-debt)
- [Enterprise](#enterprise)
- [Error Handling](#error-handling)

---

## Authentication

PRFlow supports GitHub OAuth, SAML SSO, and OIDC for authentication. All authenticated endpoints require a Bearer token.

### Headers

```http
Authorization: Bearer <access_token>
```

### GitHub OAuth

#### Initiate Login

```http
GET /api/auth/login
```

Redirects to GitHub OAuth authorization page.

#### OAuth Callback

```http
GET /api/auth/callback?code={code}&state={state}
```

Exchanges OAuth code for access tokens.

**Response:**
Redirects to dashboard with tokens in URL parameters.

#### Refresh Token

```http
POST /api/auth/refresh
Content-Type: application/json

{
  "refreshToken": "string"
}
```

**Response:**
```json
{
  "accessToken": "string",
  "refreshToken": "string",
  "expiresIn": 3600,
  "tokenType": "Bearer"
}
```

#### Get Current User

```http
GET /api/auth/me
Authorization: Bearer <token>
```

**Response:**
```json
{
  "id": "string",
  "githubId": 123456,
  "login": "username",
  "name": "Full Name",
  "email": "user@example.com",
  "avatarUrl": "https://...",
  "teams": [],
  "tokenExpiry": 1234567890
}
```

#### Validate Token

```http
GET /api/auth/validate
Authorization: Bearer <token>
```

**Response:**
```json
{
  "valid": true,
  "userId": "string",
  "expiresAt": "2024-01-01T00:00:00.000Z",
  "login": "username"
}
```

#### Logout

```http
POST /api/auth/logout
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

### SAML SSO (Enterprise)

#### Initiate SAML Login

```http
GET /api/auth/saml/:orgId/login
```

Redirects to SAML Identity Provider.

#### SAML Callback (ACS)

```http
POST /api/auth/saml/:orgId/callback
Content-Type: application/x-www-form-urlencoded

SAMLResponse={base64_response}&RelayState={state}
```

#### Get SAML Metadata

```http
GET /api/auth/saml/:orgId/metadata
```

Returns SP metadata XML for IdP configuration.

### OIDC SSO (Enterprise)

#### Initiate OIDC Login

```http
GET /api/auth/oidc/:orgId/login
```

Redirects to OIDC provider.

#### OIDC Callback

```http
GET /api/auth/oidc/:orgId/callback?code={code}&state={state}
```

---

## Health & Status

### Health Check

```http
GET /api/health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Readiness Check

```http
GET /api/health/ready
```

**Response:**
```json
{
  "status": "ready",
  "database": "connected"
}
```

---

## Repositories

### List Repositories

```http
GET /api/repositories?installationId={id}
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `installationId` | string | Filter by GitHub App installation |

**Response:**
```json
[
  {
    "id": "string",
    "githubId": 123456,
    "name": "repo-name",
    "fullName": "owner/repo-name",
    "owner": "owner",
    "isPrivate": false,
    "defaultBranch": "main",
    "settings": {
      "reviewEnabled": true,
      "testGenerationEnabled": true,
      "docUpdatesEnabled": true,
      "severityThreshold": "MEDIUM"
    }
  }
]
```

### Get Repository

```http
GET /api/repositories/:owner/:repo
```

**Response:**
```json
{
  "id": "string",
  "githubId": 123456,
  "name": "repo-name",
  "fullName": "owner/repo-name",
  "owner": "owner",
  "isPrivate": false,
  "defaultBranch": "main",
  "settings": { ... }
}
```

### Update Repository Settings

```http
PATCH /api/repositories/:owner/:repo/settings
Content-Type: application/json

{
  "reviewEnabled": true,
  "testGenerationEnabled": true,
  "docUpdatesEnabled": true,
  "assignmentEnabled": false,
  "mergeEnabled": false,
  "severityThreshold": "MEDIUM",
  "autoFixStyle": true,
  "blockOnCritical": true,
  "ignorePaths": ["vendor/**", "*.min.js"]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `reviewEnabled` | boolean | Enable automated code review |
| `testGenerationEnabled` | boolean | Generate unit tests |
| `docUpdatesEnabled` | boolean | Suggest documentation updates |
| `assignmentEnabled` | boolean | Auto-assign reviewers |
| `mergeEnabled` | boolean | Enable merge queue |
| `severityThreshold` | enum | Minimum severity: CRITICAL, HIGH, MEDIUM, LOW, NITPICK |
| `autoFixStyle` | boolean | Auto-fix style issues |
| `blockOnCritical` | boolean | Block merge on critical issues |
| `ignorePaths` | string[] | Glob patterns to ignore |

---

## Workflows

### List Workflows

```http
GET /api/workflows?repositoryId={id}&status={status}&limit={n}&offset={n}
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `repositoryId` | string | - | Filter by repository |
| `status` | enum | - | PENDING, ANALYZING, REVIEWING, COMPLETED, FAILED |
| `limit` | number | 50 | Max results (1-100) |
| `offset` | number | 0 | Pagination offset |

**Response:**
```json
{
  "data": [
    {
      "id": "string",
      "repositoryId": "string",
      "prNumber": 123,
      "prTitle": "Add new feature",
      "prUrl": "https://github.com/...",
      "headBranch": "feature/new-feature",
      "baseBranch": "main",
      "authorLogin": "username",
      "status": "COMPLETED",
      "analysis": { ... },
      "synthesis": { ... },
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "total": 100,
    "limit": 50,
    "offset": 0
  }
}
```

### Get Workflow

```http
GET /api/workflows/:workflowId
```

**Response:**
```json
{
  "id": "string",
  "repositoryId": "string",
  "prNumber": 123,
  "prTitle": "Add new feature",
  "status": "COMPLETED",
  "analysis": {
    "prType": "FEATURE",
    "riskLevel": "LOW",
    "filesModified": 5,
    "linesAdded": 150,
    "linesRemoved": 20,
    "semanticChanges": [...],
    "impactRadius": {...},
    "risks": ["..."],
    "suggestedReviewers": [...]
  },
  "reviewComments": [...],
  "generatedTests": [...],
  "docUpdates": [...],
  "synthesis": {
    "summary": "...",
    "riskAssessment": {...},
    "findingsSummary": {...},
    "humanReviewChecklist": [...]
  }
}
```

### Get Workflow Comments

```http
GET /api/workflows/:workflowId/comments
```

**Response:**
```json
[
  {
    "id": "string",
    "workflowId": "string",
    "file": "src/index.ts",
    "line": 42,
    "endLine": 45,
    "severity": "HIGH",
    "category": "SECURITY",
    "message": "Potential SQL injection vulnerability",
    "suggestion": {
      "code": "...",
      "explanation": "..."
    },
    "confidence": 0.95,
    "status": "POSTED"
  }
]
```

### Get Generated Tests

```http
GET /api/workflows/:workflowId/tests
```

**Response:**
```json
[
  {
    "id": "string",
    "workflowId": "string",
    "testFile": "src/__tests__/feature.test.ts",
    "targetFile": "src/feature.ts",
    "framework": "vitest",
    "testCode": "...",
    "coverageTargets": ["functionA", "functionB"],
    "validated": true,
    "passedValidation": true,
    "status": "VALIDATED"
  }
]
```

---

## Analytics

### Get Team Metrics

```http
GET /api/analytics/metrics?repositoryIds={ids}&startDate={date}&endDate={date}
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `repositoryIds` | string | Comma-separated repository IDs |
| `startDate` | ISO date | Start of period |
| `endDate` | ISO date | End of period |

**Response:**
```json
{
  "totalPRs": 150,
  "analyzedPRs": 145,
  "issuesFound": 342,
  "issuesResolved": 298,
  "testsGenerated": 87,
  "avgReviewTime": 2.5,
  "avgCycleTime": 18.3
}
```

### Get Trends

```http
GET /api/analytics/trends?repositoryIds={ids}&metric={metric}&startDate={date}&endDate={date}&interval={interval}
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `metric` | enum | prs, issues, tests |
| `interval` | enum | day, week, month |

**Response:**
```json
{
  "metric": "prs",
  "interval": "week",
  "data": [
    { "date": "2024-01-01", "value": 25 },
    { "date": "2024-01-08", "value": 32 }
  ]
}
```

### Get False Positive Rate

```http
GET /api/analytics/false-positive-rate?repositoryIds={ids}&startDate={date}&endDate={date}
```

**Response:**
```json
{
  "rate": 0.05
}
```

### Export Metrics

```http
GET /api/analytics/export?repositoryIds={ids}&startDate={date}&endDate={date}&format={format}
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `format` | enum | json (default), csv |

Returns metrics data in requested format.

### Get PR Metrics

```http
GET /api/analytics/workflows/:workflowId/metrics
```

**Response:**
```json
{
  "analysisLatencyMs": 1234,
  "reviewLatencyMs": 2345,
  "issuesFound": 5,
  "testsCoverage": 0.85
}
```

---

## Fixes

### Apply Single Fix

```http
POST /api/fixes/apply
Authorization: Bearer <token>
Content-Type: application/json

{
  "commentId": "string"
}
```

**Response:**
```json
{
  "success": true,
  "fixId": "string",
  "commitSha": "abc123...",
  "message": "Fix applied successfully"
}
```

### Apply Batch Fixes

```http
POST /api/fixes/apply-batch
Authorization: Bearer <token>
Content-Type: application/json

{
  "commentIds": ["id1", "id2", "id3"],
  "commitMessage": "Apply automated fixes"
}
```

**Response:**
```json
{
  "success": true,
  "batchId": "string",
  "commitSha": "abc123...",
  "appliedCount": 3,
  "failedCount": 0,
  "appliedFixes": [...],
  "failedFixes": []
}
```

### Preview Fix

```http
GET /api/fixes/preview/:commentId
Authorization: Bearer <token>
```

**Response:**
```json
{
  "commentId": "string",
  "file": "src/index.ts",
  "originalCode": "...",
  "suggestedCode": "...",
  "diff": "..."
}
```

### Revert Fix

```http
POST /api/fixes/revert/:fixId
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "fixId": "string",
  "commitSha": "def456...",
  "message": "Fix reverted successfully"
}
```

### Get Fix Details

```http
GET /api/fixes/:fixId
```

**Response:**
```json
{
  "id": "string",
  "commentId": "string",
  "repositoryId": "string",
  "prNumber": 123,
  "file": "src/index.ts",
  "originalCode": "...",
  "suggestedCode": "...",
  "commitSha": "abc123...",
  "status": "APPLIED",
  "appliedAt": "2024-01-01T00:00:00.000Z"
}
```

### List Fixes

```http
GET /api/fixes?workflowId={id}&repositoryId={id}&status={status}&limit={n}&offset={n}
```

**Response:**
```json
{
  "data": [...],
  "pagination": {
    "total": 50,
    "limit": 50,
    "offset": 0
  }
}
```

### Get Fixable Comments

```http
GET /api/fixes/fixable/:workflowId
```

**Response:**
```json
{
  "totalFixable": 5,
  "byFile": {
    "src/index.ts": [...],
    "src/utils.ts": [...]
  },
  "comments": [...]
}
```

---

## Merge Queue

### Get Merge Queue

```http
GET /api/repositories/:owner/:repo/merge-queue
```

**Response:**
```json
{
  "repository": {
    "owner": "owner",
    "repo": "repo",
    "fullName": "owner/repo"
  },
  "config": {
    "enabled": true,
    "autoMergeEnabled": true,
    "requireApprovals": 1,
    "mergeMethod": "squash"
  },
  "queue": [
    {
      "prNumber": 123,
      "status": "ready",
      "priority": 0,
      "addedAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "stats": {
    "total": 5,
    "queued": 2,
    "checking": 1,
    "ready": 1,
    "merging": 1,
    "blocked": 0
  }
}
```

### Add to Queue

```http
POST /api/repositories/:owner/:repo/merge-queue
Content-Type: application/json

{
  "prNumber": 123,
  "priority": 0
}
```

**Response:**
```json
{
  "prNumber": 123,
  "status": "queued",
  "priority": 0,
  "addedAt": "2024-01-01T00:00:00.000Z"
}
```

### Remove from Queue

```http
DELETE /api/repositories/:owner/:repo/merge-queue/:prNumber
```

### Get Queue Configuration

```http
GET /api/repositories/:owner/:repo/merge-queue/config
```

### Update Queue Configuration

```http
PATCH /api/repositories/:owner/:repo/merge-queue/config
Content-Type: application/json

{
  "enabled": true,
  "autoMergeEnabled": true,
  "requireApprovals": 1,
  "requireChecks": true,
  "requireUpToDate": true,
  "checkConflicts": true,
  "autoResolveConflicts": false,
  "mergeMethod": "squash",
  "batchSize": 3,
  "maxWaitTimeMinutes": 60
}
```

### Process Queue

```http
POST /api/repositories/:owner/:repo/merge-queue/process
```

Triggers queue processing manually.

### Get PR Conflicts

```http
GET /api/repositories/:owner/:repo/merge-queue/:prNumber/conflicts
```

**Response:**
```json
{
  "prNumber": 123,
  "hasConflicts": true,
  "conflicts": [
    {
      "prNumber": 122,
      "files": ["src/index.ts"]
    }
  ]
}
```

### Rebase PR

```http
POST /api/repositories/:owner/:repo/merge-queue/:prNumber/rebase
```

### Get Queue Statistics

```http
GET /api/repositories/:owner/:repo/merge-queue/stats
```

---

## Knowledge Graph

### Build Knowledge Graph

```http
POST /api/graph/:repositoryId/build
Content-Type: application/json

{
  "files": [
    {
      "path": "src/index.ts",
      "content": "..."
    }
  ]
}
```

**Response:**
```json
{
  "repositoryId": "string",
  "success": true,
  "stats": {
    "nodeCount": 150,
    "edgeCount": 320,
    "fileCount": 25
  },
  "lastUpdated": "2024-01-01T00:00:00.000Z"
}
```

### Get Graph Stats

```http
GET /api/graph/:repositoryId/stats
```

### Analyze Impact

```http
POST /api/graph/:repositoryId/impact
Content-Type: application/json

{
  "changedFiles": [
    {
      "path": "src/utils.ts",
      "changedLines": [10, 11, 12]
    }
  ]
}
```

**Response:**
```json
{
  "repositoryId": "string",
  "summary": {
    "changedSymbols": 3,
    "totalBlastRadius": 25,
    "maxRiskScore": 0.75,
    "affectedFilesCount": 8,
    "affectedTestsCount": 4
  },
  "analyses": [
    {
      "changedNode": {
        "id": "string",
        "name": "formatDate",
        "type": "function",
        "file": "src/utils.ts"
      },
      "impact": {
        "directDependents": 5,
        "transitiveDependents": 20,
        "blastRadius": 25,
        "riskScore": 0.75
      },
      "directDependents": [...],
      "affectedTests": [...]
    }
  ]
}
```

### Visualize Impact

```http
POST /api/graph/:repositoryId/visualize
```

Returns nodes and edges for rendering a dependency graph visualization.

### Search Symbols

```http
GET /api/graph/:repositoryId/search?query={query}&limit={n}
```

**Response:**
```json
{
  "repositoryId": "string",
  "query": "formatDate",
  "results": [
    {
      "id": "string",
      "name": "formatDate",
      "type": "function",
      "file": "src/utils.ts",
      "lines": "10-25",
      "signature": "formatDate(date: Date): string"
    }
  ],
  "totalMatches": 3
}
```

### Get Node Details

```http
GET /api/graph/:repositoryId/nodes/:nodeId
```

### Find Dependency Paths

```http
GET /api/graph/:repositoryId/paths?fromNodeId={id}&toNodeId={id}&maxDepth={n}
```

### Get File Symbols

```http
GET /api/graph/:repositoryId/files/{filePath}
```

### List All Files

```http
GET /api/graph/:repositoryId/files
```

### Clear Graph Cache

```http
DELETE /api/graph/:repositoryId
```

---

## Compliance

### Get Available Frameworks

```http
GET /api/compliance/frameworks
```

**Response:**
```json
{
  "frameworks": [
    {
      "id": "owasp_top10",
      "name": "OWASP Top 10",
      "description": "Top 10 web application security risks",
      "ruleCount": 45
    },
    {
      "id": "soc2",
      "name": "SOC 2",
      "description": "Service Organization Control 2 compliance",
      "ruleCount": 32
    },
    {
      "id": "hipaa",
      "name": "HIPAA",
      "description": "Health Insurance Portability and Accountability Act",
      "ruleCount": 28
    },
    {
      "id": "pci_dss",
      "name": "PCI DSS",
      "description": "Payment Card Industry Data Security Standard",
      "ruleCount": 35
    }
  ],
  "totalRules": 140
}
```

### Get Framework Rules

```http
GET /api/compliance/frameworks/:framework/rules
```

**Response:**
```json
{
  "framework": "owasp_top10",
  "ruleCount": 45,
  "rules": [
    {
      "id": "A01:2021",
      "name": "Broken Access Control",
      "category": "access_control",
      "severity": "critical",
      "description": "...",
      "languages": ["javascript", "typescript", "python"],
      "autoFixAvailable": true,
      "references": ["https://..."]
    }
  ]
}
```

### Run Compliance Scan

```http
POST /api/compliance/scan
Content-Type: application/json

{
  "profileId": "string",
  "frameworks": ["owasp_top10", "soc2"],
  "files": [
    {
      "path": "src/auth.ts",
      "content": "..."
    }
  ]
}
```

**Response:**
```json
{
  "scanId": "string",
  "status": "completed",
  "summary": {
    "totalViolations": 5,
    "bySeverity": {
      "critical": 1,
      "high": 2,
      "medium": 2
    }
  },
  "violations": [
    {
      "id": "string",
      "ruleId": "A01:2021",
      "ruleName": "Broken Access Control",
      "framework": "owasp_top10",
      "severity": "critical",
      "file": "src/auth.ts",
      "line": 42,
      "message": "Missing authorization check",
      "evidence": "...",
      "suggestion": "..."
    }
  ],
  "coverage": {
    "filesScanned": 25,
    "rulesApplied": 140
  }
}
```

### Scan PR

```http
POST /api/compliance/scan/pr/:owner/:repo/:prNumber
Content-Type: application/json

{
  "profileId": "string"
}
```

### Create Compliance Profile

```http
POST /api/compliance/profiles
Content-Type: application/json

{
  "name": "Production Profile",
  "frameworks": ["owasp_top10", "soc2", "pci_dss"],
  "settings": {
    "failOnSeverity": "high",
    "autoFixEnabled": true,
    "blockMergeOnViolation": true
  }
}
```

### Get Compliance Report

```http
GET /api/compliance/reports/:owner/:repo?period={period}
```

### Suppress Violation

```http
POST /api/compliance/violations/:violationId/suppress
Content-Type: application/json

{
  "reason": "False positive - this is test code",
  "approvedBy": "security-team"
}
```

---

## Technical Debt

### Get Debt Dashboard

```http
GET /api/debt/dashboard/:repositoryId
```

**Response:**
```json
{
  "success": true,
  "data": {
    "dashboard": {
      "repositoryId": "string",
      "generatedAt": "2024-01-01T00:00:00.000Z",
      "summary": {
        "totalItems": 50,
        "openItems": 35,
        "resolvedThisWeek": 5,
        "resolvedThisMonth": 15,
        "newThisWeek": 3,
        "newThisMonth": 10,
        "healthScore": 72,
        "healthTrend": "improving",
        "totalEstimatedHours": 120,
        "criticalEstimatedHours": 20,
        "avgAgeOpenDays": 14,
        "oldestOpenDays": 45
      },
      "byCategory": {...},
      "bySeverity": {
        "critical": 2,
        "high": 8,
        "medium": 15,
        "low": 10
      },
      "topPriority": [...],
      "recentActivity": [...],
      "recommendations": [...]
    }
  }
}
```

### Add Debt Item

```http
POST /api/debt/items
Content-Type: application/json

{
  "repositoryId": "string",
  "item": {
    "title": "Refactor authentication module",
    "description": "...",
    "category": "technical",
    "severity": "high",
    "file": "src/auth.ts",
    "line": 42,
    "estimatedEffort": {
      "size": "large",
      "complexity": "high",
      "risk": "medium"
    },
    "tags": ["security", "refactor"]
  }
}
```

### Update Debt Item

```http
PUT /api/debt/items/:itemId
Content-Type: application/json

{
  "repositoryId": "string",
  "item": {
    "status": "in_progress",
    "assignee": "username"
  }
}
```

### Resolve Debt Item

```http
POST /api/debt/items/:itemId/resolve
Content-Type: application/json

{
  "repositoryId": "string",
  "resolvedBy": "username",
  "resolutionPR": 123
}
```

### Get Debt Trends

```http
GET /api/debt/trends/:repositoryId
```

### Get Recommendations

```http
GET /api/debt/recommendations/:repositoryId
```

**Response:**
```json
{
  "success": true,
  "data": {
    "recommendations": [
      {
        "id": "quick-wins",
        "type": "quick_win",
        "title": "Quick Wins Sprint",
        "description": "5 items can be resolved with minimal effort",
        "items": ["id1", "id2", ...],
        "estimatedEffort": 10,
        "expectedImpact": "Immediate health score improvement",
        "priority": 8
      }
    ]
  }
}
```

### Create Debt Sprint

```http
POST /api/debt/sprints
Content-Type: application/json

{
  "repositoryId": "string",
  "sprint": {
    "name": "Q1 Debt Paydown",
    "description": "Focus on security debt",
    "startDate": "2024-01-01",
    "endDate": "2024-01-15",
    "targetItems": ["id1", "id2"],
    "targetHealthScore": 80,
    "lead": "username"
  }
}
```

### Create Debt Policy

```http
POST /api/debt/policies
Content-Type: application/json

{
  "repositoryId": "string",
  "policy": {
    "name": "No Critical Debt",
    "enabled": true,
    "thresholds": {
      "maxOpenCritical": 0,
      "maxOpenHigh": 5,
      "minHealthScore": 70
    },
    "actions": {
      "blockMerge": true,
      "notifySlack": true,
      "createIssue": true
    }
  }
}
```

### Record Skipped Review

```http
POST /api/debt/skipped-reviews
Content-Type: application/json

{
  "repositoryId": "string",
  "skip": {
    "prNumber": 123,
    "skipType": "full_review",
    "reason": "Emergency hotfix",
    "reasonCategory": "emergency",
    "skippedBy": "username",
    "riskLevel": "high",
    "followUpRequired": true,
    "followUpBy": "2024-01-08"
  }
}
```

---

## Enterprise

### Get Team Analytics

```http
GET /api/enterprise/team-analytics/:teamId
```

### Configure SSO

```http
POST /api/enterprise/sso/:orgId/configure
```

### Get Audit Logs

```http
GET /api/audit/logs?startDate={date}&endDate={date}&action={action}
```

---

## Error Handling

All errors follow a consistent format:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {}
}
```

### HTTP Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Authentication required |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource doesn't exist |
| 422 | Validation Error - Invalid data |
| 429 | Rate Limited - Too many requests |
| 500 | Internal Server Error |

### Common Error Codes

| Code | Description |
|------|-------------|
| `NOT_FOUND` | Requested resource not found |
| `VALIDATION_ERROR` | Input validation failed |
| `UNAUTHORIZED` | Authentication required |
| `FORBIDDEN` | Permission denied |
| `RATE_LIMITED` | Too many requests |
| `GITHUB_ERROR` | GitHub API error |
| `INTERNAL_ERROR` | Internal server error |

---

## Rate Limiting

API endpoints are rate limited per user:

| Tier | Requests/minute | Requests/hour |
|------|-----------------|---------------|
| Free | 60 | 1,000 |
| Pro | 300 | 10,000 |
| Enterprise | Unlimited | Unlimited |

Rate limit headers:
```http
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1234567890
```

---

## WebSocket API

Real-time updates are available via WebSocket:

```javascript
const ws = new WebSocket('ws://localhost:3001/ws');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // Handle workflow updates, review comments, etc.
};
```

### Events

| Event | Description |
|-------|-------------|
| `workflow:started` | Workflow processing started |
| `workflow:progress` | Processing progress update |
| `workflow:completed` | Workflow completed |
| `workflow:failed` | Workflow failed |
| `comment:added` | New review comment |
| `test:generated` | Test generated |
| `fix:applied` | Fix applied |

---

## OpenAPI Specification

Full OpenAPI 3.0 specification available at:

```
GET /api/openapi.json
```

Interactive Swagger UI (when enabled):

```
GET /api/docs
```
