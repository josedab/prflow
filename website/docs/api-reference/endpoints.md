---
sidebar_position: 2
title: Endpoints
description: Complete reference for all PRFlow API endpoints
---

# API Endpoints

Complete reference for all PRFlow REST API endpoints.

## Health Endpoints

Health endpoints don't require authentication.

### Liveness Check

Check if the API server is running.

```http
GET /api/health
```

**Response:**

```json
{
  "status": "ok",
  "version": "1.0.0",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Readiness Check

Check if all dependencies are connected and the server is ready to handle requests.

```http
GET /api/health/ready
```

**Response:**

```json
{
  "status": "ready",
  "checks": {
    "database": {
      "status": "connected",
      "latencyMs": 2
    },
    "redis": {
      "status": "connected",
      "latencyMs": 1
    },
    "github": {
      "status": "connected"
    }
  }
}
```

**Possible statuses:**
- `ready` — All systems operational
- `degraded` — Some systems have issues but API is functional
- `unavailable` — Critical systems are down

---

## Repository Endpoints

### List Repositories

List all repositories where PRFlow is installed.

```http
GET /api/repositories
```

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | number | 1 | Page number |
| `perPage` | number | 20 | Items per page (max: 100) |
| `search` | string | - | Search by name |
| `sort` | string | `installedAt` | Sort field |
| `order` | string | `desc` | Sort order (`asc` or `desc`) |

**Example:**

```bash
curl -H "Authorization: Bearer $API_KEY" \
  "https://api.prflow.dev/v1/repositories?page=1&perPage=50&search=api"
```

**Response:**

```json
{
  "data": [
    {
      "id": "repo_abc123",
      "owner": "acme",
      "name": "api",
      "fullName": "acme/api",
      "private": true,
      "defaultBranch": "main",
      "language": "TypeScript",
      "settings": {
        "reviewEnabled": true,
        "testGeneration": true,
        "docUpdates": true,
        "severityThreshold": "medium",
        "ignorePaths": ["dist/**", "*.min.js"]
      },
      "stats": {
        "totalPRs": 234,
        "totalIssuesFound": 567,
        "avgAnalysisTime": 45.2
      },
      "installedAt": "2024-01-01T00:00:00.000Z",
      "lastActivityAt": "2024-01-15T10:30:00.000Z"
    }
  ],
  "meta": {
    "total": 42,
    "page": 1,
    "perPage": 50,
    "totalPages": 1
  }
}
```

### Get Repository

Get details for a specific repository.

```http
GET /api/repositories/:owner/:repo
```

**Path Parameters:**

| Parameter | Description |
|-----------|-------------|
| `owner` | Repository owner (user or organization) |
| `repo` | Repository name |

**Example:**

```bash
curl -H "Authorization: Bearer $API_KEY" \
  https://api.prflow.dev/v1/repositories/acme/api
```

**Response:**

```json
{
  "data": {
    "id": "repo_abc123",
    "owner": "acme",
    "name": "api",
    "fullName": "acme/api",
    "private": true,
    "defaultBranch": "main",
    "language": "TypeScript",
    "settings": {
      "reviewEnabled": true,
      "testGeneration": true,
      "docUpdates": true,
      "severityThreshold": "medium",
      "blockOnCritical": true,
      "failOnHigh": false,
      "maxComments": 25,
      "ignorePaths": ["dist/**"],
      "agents": {
        "analyzer": { "enabled": true },
        "reviewer": { "enabled": true, "categories": ["security", "bug", "performance"] },
        "testGenerator": { "enabled": true, "framework": "vitest" },
        "documentation": { "enabled": true }
      }
    },
    "stats": {
      "totalPRs": 234,
      "totalIssuesFound": 567,
      "issuesByCategory": {
        "security": 45,
        "bug": 234,
        "performance": 123,
        "error_handling": 165
      },
      "avgAnalysisTime": 45.2,
      "avgTimeToMerge": 14400
    },
    "webhookStatus": "active",
    "installedAt": "2024-01-01T00:00:00.000Z",
    "lastActivityAt": "2024-01-15T10:30:00.000Z"
  }
}
```

### Update Repository Settings

Update configuration for a repository.

```http
PATCH /api/repositories/:owner/:repo/settings
```

**Request Body:**

```json
{
  "reviewEnabled": true,
  "testGeneration": false,
  "docUpdates": true,
  "severityThreshold": "high",
  "blockOnCritical": true,
  "failOnHigh": true,
  "maxComments": 15,
  "ignorePaths": ["dist/**", "*.min.js", "vendor/**"],
  "agents": {
    "reviewer": {
      "categories": ["security", "bug"]
    }
  }
}
```

**Example:**

```bash
curl -X PATCH \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"severityThreshold": "high", "maxComments": 15}' \
  https://api.prflow.dev/v1/repositories/acme/api/settings
```

**Response:**

```json
{
  "data": {
    "settings": {
      "reviewEnabled": true,
      "testGeneration": false,
      "docUpdates": true,
      "severityThreshold": "high",
      "blockOnCritical": true,
      "failOnHigh": true,
      "maxComments": 15,
      "ignorePaths": ["dist/**", "*.min.js", "vendor/**"]
    },
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

### Get Repository Stats

Get detailed statistics for a repository.

```http
GET /api/repositories/:owner/:repo/stats
```

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `startDate` | string | 30 days ago | Start date (ISO 8601) |
| `endDate` | string | now | End date (ISO 8601) |

**Response:**

```json
{
  "data": {
    "period": {
      "start": "2024-01-01T00:00:00.000Z",
      "end": "2024-01-15T23:59:59.000Z"
    },
    "prs": {
      "total": 45,
      "analyzed": 45,
      "merged": 38,
      "avgTimeToMerge": 14400
    },
    "issues": {
      "total": 123,
      "byCategory": {
        "security": 8,
        "bug": 45,
        "performance": 30,
        "error_handling": 40
      },
      "bySeverity": {
        "critical": 2,
        "high": 15,
        "medium": 56,
        "low": 50
      },
      "resolved": 98,
      "resolutionRate": 0.797
    },
    "tests": {
      "suggested": 67,
      "accepted": 45
    },
    "trends": {
      "issuesPerPR": [
        { "date": "2024-01-01", "value": 3.2 },
        { "date": "2024-01-08", "value": 2.8 },
        { "date": "2024-01-15", "value": 2.5 }
      ]
    }
  }
}
```

---

## Workflow Endpoints

### List Workflows

List workflow runs (analysis jobs).

```http
GET /api/workflows
```

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | number | 1 | Page number |
| `perPage` | number | 20 | Items per page (max: 100) |
| `repository` | string | - | Filter by repository (`owner/name`) |
| `status` | string | - | Filter by status |
| `riskLevel` | string | - | Filter by risk level |
| `startDate` | string | - | Filter by start date |
| `endDate` | string | - | Filter by end date |

**Status values:** `pending`, `running`, `completed`, `failed`, `cancelled`

**Risk level values:** `low`, `medium`, `high`, `critical`

**Example:**

```bash
curl -H "Authorization: Bearer $API_KEY" \
  "https://api.prflow.dev/v1/workflows?repository=acme/api&status=completed&perPage=10"
```

**Response:**

```json
{
  "data": [
    {
      "id": "wf_xyz789",
      "repository": "acme/api",
      "prNumber": 123,
      "prTitle": "feat: add user authentication",
      "prAuthor": "alice",
      "status": "completed",
      "analysis": {
        "type": "feature",
        "riskLevel": "medium"
      },
      "summary": {
        "issuesFound": 5,
        "testsGenerated": 3,
        "critical": 0,
        "high": 1,
        "medium": 3,
        "low": 1
      },
      "duration": 42500,
      "startedAt": "2024-01-15T10:00:00.000Z",
      "completedAt": "2024-01-15T10:00:42.500Z"
    }
  ],
  "meta": {
    "total": 234,
    "page": 1,
    "perPage": 10,
    "totalPages": 24
  }
}
```

### Get Workflow

Get detailed information about a specific workflow run.

```http
GET /api/workflows/:id
```

**Path Parameters:**

| Parameter | Description |
|-----------|-------------|
| `id` | Workflow ID (e.g., `wf_xyz789`) |

**Example:**

```bash
curl -H "Authorization: Bearer $API_KEY" \
  https://api.prflow.dev/v1/workflows/wf_xyz789
```

**Response:**

```json
{
  "data": {
    "id": "wf_xyz789",
    "repository": "acme/api",
    "prNumber": 123,
    "prTitle": "feat: add user authentication",
    "prUrl": "https://github.com/acme/api/pull/123",
    "prAuthor": "alice",
    "headSha": "abc123def456",
    "baseBranch": "main",
    "headBranch": "feature/auth",
    "status": "completed",
    
    "analysis": {
      "type": "feature",
      "riskLevel": "medium",
      "semanticChanges": [
        {
          "type": "function",
          "action": "added",
          "name": "authenticate",
          "file": "src/auth/authenticate.ts",
          "breaking": false
        },
        {
          "type": "function",
          "action": "added",
          "name": "validateToken",
          "file": "src/auth/validate.ts",
          "breaking": false
        }
      ],
      "impactRadius": {
        "directDependents": 5,
        "transitiveDependents": 12,
        "affectedFiles": [
          "src/middleware/auth.ts",
          "src/routes/protected.ts"
        ]
      },
      "suggestedReviewers": [
        { "login": "bob", "reason": "auth module owner" },
        { "login": "carol", "reason": "security team" }
      ]
    },
    
    "review": {
      "summary": {
        "critical": 0,
        "high": 1,
        "medium": 3,
        "low": 1,
        "nitpick": 2
      },
      "comments": [
        {
          "id": "cmt_abc123",
          "file": "src/auth/authenticate.ts",
          "line": 42,
          "endLine": 45,
          "severity": "high",
          "category": "security",
          "message": "Token should be validated before use",
          "explanation": "The token is used without validation, which could allow malformed tokens to pass through.",
          "suggestion": {
            "description": "Add token validation",
            "originalCode": "const decoded = jwt.decode(token);",
            "suggestedCode": "const decoded = jwt.verify(token, secret);"
          },
          "confidence": 0.95,
          "postedToGitHub": true
        }
      ]
    },
    
    "tests": {
      "generated": [
        {
          "targetFile": "src/auth/authenticate.ts",
          "testFile": "src/auth/authenticate.test.ts",
          "framework": "vitest",
          "tests": [
            "should authenticate valid credentials",
            "should reject invalid password",
            "should reject unknown user"
          ]
        }
      ]
    },
    
    "documentation": {
      "suggestions": [
        {
          "file": "src/auth/authenticate.ts",
          "type": "jsdoc",
          "function": "authenticate",
          "suggestion": "Add JSDoc for public function"
        }
      ]
    },
    
    "agents": {
      "analyzer": { "status": "completed", "durationMs": 5200 },
      "reviewer": { "status": "completed", "durationMs": 35000 },
      "testGenerator": { "status": "completed", "durationMs": 12000 },
      "documentation": { "status": "completed", "durationMs": 8000 }
    },
    
    "githubCheckRunId": 12345678,
    "githubCommentId": 87654321,
    
    "duration": 42500,
    "startedAt": "2024-01-15T10:00:00.000Z",
    "completedAt": "2024-01-15T10:00:42.500Z"
  }
}
```

### Trigger Workflow

Manually trigger analysis on a PR.

```http
POST /api/workflows
```

**Request Body:**

```json
{
  "repository": "acme/api",
  "prNumber": 123,
  "options": {
    "agents": ["analyzer", "reviewer"],
    "force": true
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `repository` | string | Yes | Repository full name (`owner/repo`) |
| `prNumber` | number | Yes | Pull request number |
| `options.agents` | array | No | Specific agents to run (default: all) |
| `options.force` | boolean | No | Re-run even if already analyzed |

**Example:**

```bash
curl -X POST \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"repository": "acme/api", "prNumber": 123}' \
  https://api.prflow.dev/v1/workflows
```

**Response:**

```json
{
  "data": {
    "id": "wf_newworkflow",
    "repository": "acme/api",
    "prNumber": 123,
    "status": "pending",
    "createdAt": "2024-01-15T10:30:00.000Z"
  }
}
```

### Cancel Workflow

Cancel a running workflow.

```http
POST /api/workflows/:id/cancel
```

**Response:**

```json
{
  "data": {
    "id": "wf_xyz789",
    "status": "cancelled",
    "cancelledAt": "2024-01-15T10:30:00.000Z"
  }
}
```

### Get Workflow Comments

Get all review comments from a workflow.

```http
GET /api/workflows/:id/comments
```

**Response:**

```json
{
  "data": [
    {
      "id": "cmt_abc123",
      "file": "src/auth/authenticate.ts",
      "line": 42,
      "severity": "high",
      "category": "security",
      "message": "Token should be validated before use",
      "suggestion": {
        "originalCode": "const decoded = jwt.decode(token);",
        "suggestedCode": "const decoded = jwt.verify(token, secret);"
      }
    }
  ]
}
```

### Get Generated Tests

Get test suggestions from a workflow.

```http
GET /api/workflows/:id/tests
```

**Response:**

```json
{
  "data": [
    {
      "targetFile": "src/auth/authenticate.ts",
      "testFile": "src/auth/authenticate.test.ts",
      "framework": "vitest",
      "code": "import { authenticate } from './authenticate';\n\ndescribe('authenticate', () => {\n  it('should authenticate valid credentials', async () => {\n    // ...\n  });\n});"
    }
  ]
}
```

---

## Analytics Endpoints

### Get Metrics

Get aggregated metrics across repositories.

```http
GET /api/analytics/metrics
```

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `repository` | string | - | Filter by repository |
| `startDate` | string | 30 days ago | Start date (ISO 8601) |
| `endDate` | string | now | End date (ISO 8601) |
| `groupBy` | string | `day` | Grouping (`day`, `week`, `month`) |

**Example:**

```bash
curl -H "Authorization: Bearer $API_KEY" \
  "https://api.prflow.dev/v1/analytics/metrics?startDate=2024-01-01&endDate=2024-01-31"
```

**Response:**

```json
{
  "data": {
    "period": {
      "start": "2024-01-01T00:00:00.000Z",
      "end": "2024-01-31T23:59:59.000Z"
    },
    "summary": {
      "totalPRs": 156,
      "totalIssuesFound": 423,
      "avgIssuesPerPR": 2.7,
      "avgAnalysisTime": 38.5,
      "avgTimeToMerge": 14400
    },
    "byCategory": {
      "security": { "count": 45, "percentage": 10.6 },
      "bug": { "count": 156, "percentage": 36.9 },
      "performance": { "count": 98, "percentage": 23.2 },
      "error_handling": { "count": 124, "percentage": 29.3 }
    },
    "bySeverity": {
      "critical": { "count": 8, "percentage": 1.9 },
      "high": { "count": 67, "percentage": 15.8 },
      "medium": { "count": 198, "percentage": 46.8 },
      "low": { "count": 150, "percentage": 35.5 }
    },
    "trends": {
      "prsAnalyzed": [
        { "date": "2024-01-01", "value": 5 },
        { "date": "2024-01-02", "value": 8 }
      ],
      "issuesFound": [
        { "date": "2024-01-01", "value": 12 },
        { "date": "2024-01-02", "value": 23 }
      ]
    }
  }
}
```

### Export Metrics

Export metrics as CSV.

```http
GET /api/analytics/export
```

**Query Parameters:**

Same as `/api/analytics/metrics`, plus:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `format` | string | `csv` | Export format (`csv`, `json`) |

**Response:** CSV file download

```csv
date,repository,prs_analyzed,issues_found,critical,high,medium,low
2024-01-01,acme/api,5,12,0,2,6,4
2024-01-02,acme/api,8,23,1,5,10,7
```

---

## User Endpoints

### Get Current User

Get the authenticated user's information.

```http
GET /api/user
```

**Response:**

```json
{
  "data": {
    "id": "user_abc123",
    "login": "alice",
    "email": "alice@example.com",
    "avatarUrl": "https://avatars.githubusercontent.com/u/12345",
    "plan": "pro",
    "organization": "acme",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### List API Keys

List your API keys.

```http
GET /api/user/api-keys
```

**Response:**

```json
{
  "data": [
    {
      "id": "key_abc123",
      "name": "CI/CD Key",
      "prefix": "prflow_abc",
      "scopes": ["read", "write"],
      "lastUsedAt": "2024-01-15T10:30:00.000Z",
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

### Create API Key

Create a new API key.

```http
POST /api/user/api-keys
```

**Request Body:**

```json
{
  "name": "Production Key",
  "scopes": ["read", "write"]
}
```

**Response:**

```json
{
  "data": {
    "id": "key_xyz789",
    "name": "Production Key",
    "key": "prflow_xyz789_fullkeyonlyshownonce",
    "scopes": ["read", "write"],
    "createdAt": "2024-01-15T10:30:00.000Z"
  }
}
```

:::warning
The full API key is only returned once. Store it securely.
:::

### Delete API Key

```http
DELETE /api/user/api-keys/:id
```

**Response:** `204 No Content`

---

## Next Steps

- [**API Overview**](/docs/api-reference) — Authentication, rate limits, SDKs
- [**Webhooks**](/docs/api-reference/webhooks) — Real-time event notifications
- [**Configuration**](/docs/guides/configuration) — All config options
