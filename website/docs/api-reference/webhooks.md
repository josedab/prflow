---
sidebar_position: 3
title: Webhooks
description: Real-time event notifications from PRFlow
---

# Webhooks

PRFlow can send real-time notifications to your systems when events occur. Use webhooks to integrate PRFlow with your tools, dashboards, and automation.

## Incoming Webhooks (from GitHub)

PRFlow receives webhooks from GitHub to process pull request events.

### Supported GitHub Events

| Event | Description | PRFlow Action |
|-------|-------------|---------------|
| `pull_request.opened` | New PR created | Full analysis |
| `pull_request.synchronize` | New commits pushed | Full analysis |
| `pull_request.reopened` | PR reopened | Full analysis |
| `pull_request.ready_for_review` | Draft marked ready | Full analysis |
| `pull_request.closed` | PR closed/merged | Record metrics |
| `pull_request_review.submitted` | Review submitted | Track resolution |
| `issue_comment.created` | Comment on PR | Check for commands |
| `check_run.rerequested` | Check re-requested | Re-run analysis |

### Configuring GitHub Webhooks

When setting up your GitHub App, configure:

**Webhook URL:**
```
https://your-domain.com/api/webhooks/github
```

**Content type:**
```
application/json
```

**Secret:**
Generate a secure random string and set it as `GITHUB_WEBHOOK_SECRET` in your environment.

### Webhook Verification

PRFlow verifies all incoming GitHub webhooks using HMAC-SHA256:

```typescript
// PRFlow automatically verifies webhooks
// The signature is in the X-Hub-Signature-256 header
const signature = request.headers['x-hub-signature-256'];
const isValid = verifyWebhookSignature(payload, signature, GITHUB_WEBHOOK_SECRET);

if (!isValid) {
  throw new Error('Invalid webhook signature');
}
```

---

## Outgoing Webhooks (from PRFlow)

PRFlow can notify your systems when events occur.

### Configuring Outgoing Webhooks

#### Via API

```http
POST /api/webhooks
```

```json
{
  "url": "https://your-system.com/prflow-events",
  "secret": "your-verification-secret",
  "events": [
    "workflow.completed",
    "workflow.failed",
    "issue.found"
  ],
  "repositories": ["acme/api", "acme/web"],
  "active": true
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | Yes | Your webhook endpoint URL |
| `secret` | string | Yes | Secret for signature verification |
| `events` | array | Yes | Events to receive |
| `repositories` | array | No | Filter by repositories (empty = all) |
| `active` | boolean | No | Enable/disable webhook |

#### Via Dashboard

1. Go to **Settings → Webhooks**
2. Click **Add Webhook**
3. Enter your endpoint URL
4. Generate or enter a secret
5. Select events to receive
6. Save

### Event Types

#### Workflow Events

| Event | Description | When Fired |
|-------|-------------|------------|
| `workflow.started` | Analysis began | PR received, job queued |
| `workflow.completed` | Analysis finished successfully | All agents completed |
| `workflow.failed` | Analysis failed | Error during processing |
| `workflow.cancelled` | Analysis was cancelled | User or system cancelled |

#### Issue Events

| Event | Description | When Fired |
|-------|-------------|------------|
| `issue.found` | Issues detected in PR | Review agent found issues |
| `issue.critical` | Critical issue detected | Security vulnerability, etc. |

#### Repository Events

| Event | Description | When Fired |
|-------|-------------|------------|
| `repository.installed` | PRFlow installed | App added to repo |
| `repository.uninstalled` | PRFlow removed | App removed from repo |
| `repository.settings_changed` | Settings updated | Config changed via API/UI |

### Payload Format

All webhook payloads follow this structure:

```json
{
  "id": "evt_abc123xyz",
  "event": "workflow.completed",
  "timestamp": "2024-01-15T10:30:45.000Z",
  "data": {
    // Event-specific data
  }
}
```

### Event Payloads

#### `workflow.started`

```json
{
  "id": "evt_abc123",
  "event": "workflow.started",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "data": {
    "workflowId": "wf_xyz789",
    "repository": {
      "owner": "acme",
      "name": "api",
      "fullName": "acme/api"
    },
    "pullRequest": {
      "number": 123,
      "title": "feat: add user authentication",
      "author": "alice",
      "url": "https://github.com/acme/api/pull/123"
    },
    "agents": ["analyzer", "reviewer", "testGenerator", "documentation"]
  }
}
```

#### `workflow.completed`

```json
{
  "id": "evt_abc124",
  "event": "workflow.completed",
  "timestamp": "2024-01-15T10:30:45.000Z",
  "data": {
    "workflowId": "wf_xyz789",
    "repository": {
      "owner": "acme",
      "name": "api",
      "fullName": "acme/api"
    },
    "pullRequest": {
      "number": 123,
      "title": "feat: add user authentication",
      "author": "alice",
      "url": "https://github.com/acme/api/pull/123"
    },
    "analysis": {
      "type": "feature",
      "riskLevel": "medium"
    },
    "results": {
      "issuesFound": 5,
      "testsGenerated": 3,
      "bySeverity": {
        "critical": 0,
        "high": 1,
        "medium": 3,
        "low": 1
      },
      "byCategory": {
        "security": 1,
        "bug": 2,
        "performance": 2
      }
    },
    "duration": 45000,
    "checkStatus": "success",
    "commentPosted": true
  }
}
```

#### `workflow.failed`

```json
{
  "id": "evt_abc125",
  "event": "workflow.failed",
  "timestamp": "2024-01-15T10:30:45.000Z",
  "data": {
    "workflowId": "wf_xyz789",
    "repository": {
      "owner": "acme",
      "name": "api",
      "fullName": "acme/api"
    },
    "pullRequest": {
      "number": 123,
      "title": "feat: add user authentication"
    },
    "error": {
      "code": "GITHUB_API_ERROR",
      "message": "Failed to fetch PR diff",
      "retryable": true
    },
    "failedAgents": ["reviewer"]
  }
}
```

#### `issue.critical`

```json
{
  "id": "evt_abc126",
  "event": "issue.critical",
  "timestamp": "2024-01-15T10:30:30.000Z",
  "data": {
    "workflowId": "wf_xyz789",
    "repository": {
      "owner": "acme",
      "name": "api",
      "fullName": "acme/api"
    },
    "pullRequest": {
      "number": 123,
      "title": "feat: add user authentication",
      "url": "https://github.com/acme/api/pull/123"
    },
    "issue": {
      "id": "iss_critical1",
      "file": "src/auth/login.ts",
      "line": 42,
      "severity": "critical",
      "category": "security",
      "message": "SQL injection vulnerability detected",
      "explanation": "User input is directly interpolated into SQL query"
    }
  }
}
```

### Signature Verification

PRFlow signs all outgoing webhooks. Verify them in your handler:

```typescript
import crypto from 'crypto';

function verifyPRFlowWebhook(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  const sig = signature.replace('sha256=', '');
  
  return crypto.timingSafeEqual(
    Buffer.from(sig),
    Buffer.from(expected)
  );
}

// Express.js example
app.post('/prflow-events', (req, res) => {
  const signature = req.headers['x-prflow-signature'];
  const isValid = verifyPRFlowWebhook(
    JSON.stringify(req.body),
    signature,
    process.env.PRFLOW_WEBHOOK_SECRET
  );
  
  if (!isValid) {
    return res.status(401).send('Invalid signature');
  }
  
  // Process webhook
  const { event, data } = req.body;
  console.log(`Received ${event}:`, data);
  
  res.status(200).send('OK');
});
```

### Headers

PRFlow includes these headers with webhook requests:

| Header | Description |
|--------|-------------|
| `X-PRFlow-Event` | Event type (e.g., `workflow.completed`) |
| `X-PRFlow-Signature` | HMAC-SHA256 signature |
| `X-PRFlow-Delivery` | Unique delivery ID |
| `X-PRFlow-Timestamp` | Unix timestamp |
| `Content-Type` | `application/json` |

### Retry Policy

Failed webhook deliveries are retried with exponential backoff:

| Attempt | Delay |
|---------|-------|
| 1 | Immediate |
| 2 | 1 minute |
| 3 | 5 minutes |
| 4 | 30 minutes |
| 5 | 2 hours |

After 5 failures, the delivery is marked as failed.

**Successful delivery:** HTTP 2xx response within 30 seconds

### Webhook Logs

View delivery history via API:

```http
GET /api/webhooks/:id/deliveries
```

**Response:**

```json
{
  "data": [
    {
      "id": "del_abc123",
      "webhookId": "whk_xyz789",
      "event": "workflow.completed",
      "url": "https://your-system.com/prflow-events",
      "status": "success",
      "statusCode": 200,
      "responseTime": 145,
      "attempt": 1,
      "timestamp": "2024-01-15T10:30:45.000Z",
      "request": {
        "headers": { "X-PRFlow-Event": "workflow.completed" },
        "body": "..."
      },
      "response": {
        "statusCode": 200,
        "body": "OK"
      }
    }
  ],
  "meta": {
    "total": 100,
    "page": 1,
    "perPage": 20
  }
}
```

### Managing Webhooks

#### List Webhooks

```http
GET /api/webhooks
```

#### Get Webhook

```http
GET /api/webhooks/:id
```

#### Update Webhook

```http
PATCH /api/webhooks/:id
```

```json
{
  "events": ["workflow.completed", "issue.critical"],
  "active": true
}
```

#### Delete Webhook

```http
DELETE /api/webhooks/:id
```

#### Test Webhook

Send a test event to verify your endpoint:

```http
POST /api/webhooks/:id/test
```

```json
{
  "event": "workflow.completed"
}
```

---

## Integration Examples

### Slack Notification

```typescript
// Receive PRFlow webhook and post to Slack
app.post('/prflow-events', async (req, res) => {
  const { event, data } = req.body;
  
  if (event === 'workflow.completed' && data.results.issuesFound > 0) {
    await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `🔍 PRFlow found ${data.results.issuesFound} issues in ${data.repository.fullName}#${data.pullRequest.number}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*<${data.pullRequest.url}|${data.pullRequest.title}>*\nRisk: ${data.analysis.riskLevel} | Issues: ${data.results.issuesFound}`
            }
          }
        ]
      })
    });
  }
  
  res.status(200).send('OK');
});
```

### Jira Ticket Creation

```typescript
app.post('/prflow-events', async (req, res) => {
  const { event, data } = req.body;
  
  if (event === 'issue.critical') {
    await jira.createIssue({
      project: 'SEC',
      issueType: 'Bug',
      summary: `Security issue in ${data.repository.fullName}`,
      description: `
        *PR:* ${data.pullRequest.url}
        *File:* ${data.issue.file}:${data.issue.line}
        *Issue:* ${data.issue.message}
      `,
      priority: 'Critical'
    });
  }
  
  res.status(200).send('OK');
});
```

### Metrics Dashboard

```typescript
// Store metrics in your analytics system
app.post('/prflow-events', async (req, res) => {
  const { event, data, timestamp } = req.body;
  
  if (event === 'workflow.completed') {
    await analytics.track('prflow_analysis', {
      repository: data.repository.fullName,
      prNumber: data.pullRequest.number,
      riskLevel: data.analysis.riskLevel,
      issuesFound: data.results.issuesFound,
      duration: data.duration,
      timestamp
    });
  }
  
  res.status(200).send('OK');
});
```

---

## Next Steps

- [**API Overview**](/docs/api-reference) — Authentication and basics
- [**Endpoints Reference**](/docs/api-reference/endpoints) — All API endpoints
- [**Configuration**](/docs/guides/configuration) — Config options
