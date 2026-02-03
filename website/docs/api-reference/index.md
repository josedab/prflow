---
sidebar_position: 1
title: API Overview
description: Introduction to the PRFlow REST API
---

# API Overview

PRFlow provides a REST API for programmatic access to all features. Use it to integrate PRFlow into your tools, dashboards, and workflows.

## Base URL

**Hosted service:**
```
https://api.prflow.dev/v1
```

**Self-hosted:**
```
https://your-domain.com/api
```

---

## Authentication

All API requests (except health endpoints) require authentication via Bearer token.

### Getting an API Key

1. Go to the PRFlow dashboard
2. Navigate to **Settings → API Keys**
3. Click **Create API Key**
4. Copy the key (it's only shown once)

### Using the API Key

Include the token in the `Authorization` header:

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  https://api.prflow.dev/v1/repositories
```

### API Key Scopes

| Scope | Description |
|-------|-------------|
| `read` | Read-only access to repositories and workflows |
| `write` | Full access including settings changes |
| `admin` | Organization-level management |

---

## Request Format

### Content Type

```
Content-Type: application/json
```

### Pagination

List endpoints support pagination:

```bash
GET /api/repositories?page=2&perPage=50
```

| Parameter | Default | Max |
|-----------|---------|-----|
| `page` | 1 | - |
| `perPage` | 20 | 100 |

---

## Response Format

### Success Response

```json
{
  "data": {
    "id": "repo_123",
    "name": "my-repo"
  }
}
```

### List Response

```json
{
  "data": [
    { "id": "repo_123", "name": "repo-1" },
    { "id": "repo_456", "name": "repo-2" }
  ],
  "meta": {
    "total": 42,
    "page": 1,
    "perPage": 20,
    "totalPages": 3
  }
}
```

### Error Response

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Repository not found",
    "details": {
      "owner": "acme",
      "repo": "unknown-repo"
    }
  }
}
```

### HTTP Status Codes

| Code | Description |
|------|-------------|
| `200` | Success |
| `201` | Created |
| `204` | No content (successful delete) |
| `400` | Bad request (invalid parameters) |
| `401` | Unauthorized (missing or invalid token) |
| `403` | Forbidden (insufficient permissions) |
| `404` | Not found |
| `429` | Rate limit exceeded |
| `500` | Internal server error |

---

## Rate Limiting

Rate limits depend on your plan:

| Plan | Requests/minute | Burst |
|------|-----------------|-------|
| Free | 60 | 10 |
| Pro | 300 | 50 |
| Enterprise | Custom | Custom |

### Rate Limit Headers

Every response includes rate limit headers:

```
X-RateLimit-Limit: 300
X-RateLimit-Remaining: 245
X-RateLimit-Reset: 1705312800
```

### Handling Rate Limits

When rate limited, you'll receive a `429` response:

```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded. Retry after 45 seconds.",
    "retryAfter": 45
  }
}
```

**Best practices:**
- Implement exponential backoff
- Cache responses where possible
- Use webhooks for real-time updates instead of polling

---

## Quick Examples

### List Your Repositories

```bash
curl -H "Authorization: Bearer $API_KEY" \
  https://api.prflow.dev/v1/repositories
```

### Get Recent Workflow Runs

```bash
curl -H "Authorization: Bearer $API_KEY" \
  "https://api.prflow.dev/v1/workflows?perPage=10"
```

### Update Repository Settings

```bash
curl -X PATCH \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"reviewEnabled": true, "severityThreshold": "high"}' \
  https://api.prflow.dev/v1/repositories/acme/api/settings
```

### Trigger Analysis on a PR

```bash
curl -X POST \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"repository": "acme/api", "prNumber": 123}' \
  https://api.prflow.dev/v1/workflows
```

---

## SDKs and Libraries

### JavaScript/TypeScript

```bash
npm install @prflow/client
```

```typescript
import { PRFlowClient } from '@prflow/client';

const client = new PRFlowClient({
  apiKey: process.env.PRFLOW_API_KEY,
});

// List repositories
const repos = await client.repositories.list();

// Get workflow details
const workflow = await client.workflows.get('wf_abc123');

// Update settings
await client.repositories.updateSettings('acme/api', {
  reviewEnabled: true,
  severityThreshold: 'medium',
});
```

### Python

```bash
pip install prflow
```

```python
from prflow import PRFlowClient

client = PRFlowClient(api_key="your-api-key")

# List repositories
repos = client.repositories.list()

# Get workflow details
workflow = client.workflows.get("wf_abc123")
```

### cURL

All examples in this documentation use cURL. The pattern is:

```bash
curl -X METHOD \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  [-d 'JSON_BODY'] \
  "https://api.prflow.dev/v1/ENDPOINT"
```

---

## Versioning

The API is versioned via URL path (`/v1/`). Breaking changes result in a new version.

**Current version:** `v1`

**Version lifecycle:**
- New versions announced 6 months before deprecation
- Old versions supported for 12 months after deprecation

---

## OpenAPI Specification

Download the OpenAPI spec for code generation:

```
https://api.prflow.dev/v1/openapi.json
```

Use with tools like:
- [Swagger UI](https://swagger.io/tools/swagger-ui/)
- [openapi-generator](https://openapi-generator.tech/)
- Postman (import from URL)

---

## Next Steps

- [**Endpoints Reference**](/docs/api-reference/endpoints) — All available endpoints
- [**Webhooks**](/docs/api-reference/webhooks) — Real-time event notifications
- [**GitHub Action**](/docs/guides/github-action) — CI/CD integration
