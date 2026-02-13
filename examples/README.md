# PRFlow Examples

These examples demonstrate PRFlow's capabilities. All require the API to be running:

```bash
pnpm dev
```

## Available Examples

### `curl-health.sh` — Health Check

Verifies the API and database are running.

```bash
bash examples/curl-health.sh
```

**Expected output:**
```json
{ "status": "ok", "timestamp": "..." }
{ "status": "ready", "database": "connected" }
```

### `curl-analyze.sh` — Analyze a Diff

Sends a sample diff with intentional security issues (SQL injection, hardcoded secrets, plaintext password comparison) to the playground endpoint.

```bash
bash examples/curl-analyze.sh
```

### `node-client.mjs` — Node.js API Client

A zero-dependency Node.js script that calls the health and analysis APIs. Shows how to integrate PRFlow from code.

```bash
node examples/node-client.mjs
```

### `sample-diff.patch` — Sample Diff

A realistic patch file you can use for testing. Contains a login function with multiple security issues for PRFlow to detect.

```bash
# Use with curl directly
curl -X POST http://localhost:3001/api/playground/analyze \
  -H "Content-Type: application/json" \
  -d "$(jq -Rs '{diff: .}' examples/sample-diff.patch)"
```

### `sample-webhook.json` — Webhook Payload

A sample GitHub pull request webhook payload for testing webhook handlers.
