---
sidebar_position: 3
title: GitHub App Setup
description: Configure a GitHub App for advanced PRFlow features
---

# GitHub App Setup

The GitHub Action works without a GitHub App using `GITHUB_TOKEN`. But for advanced features—persistent settings, team analytics, and the web dashboard—you'll need a GitHub App.

## When You Need a GitHub App

| Feature | GITHUB_TOKEN | GitHub App |
|---------|:------------:|:----------:|
| PR analysis | ✅ | ✅ |
| Review comments | ✅ | ✅ |
| Check status | ✅ | ✅ |
| Test generation | ✅ | ✅ |
| Persistent settings | ❌ | ✅ |
| Web dashboard | ❌ | ✅ |
| Team analytics | ❌ | ✅ |
| Cross-repo insights | ❌ | ✅ |
| Webhook-driven analysis | ❌ | ✅ |

**If you just want automated reviews**, the GitHub Action with `GITHUB_TOKEN` is enough.

**If you want the full platform**, continue with this guide.

---

## Step 1: Create the GitHub App

1. Go to **GitHub Settings** → **Developer settings** → **GitHub Apps**
2. Click **New GitHub App**
3. Fill in the basic information:

| Field | Value |
|-------|-------|
| **GitHub App name** | `PRFlow` (or your preferred name) |
| **Homepage URL** | `https://prflow.dev` (or your deployment URL) |
| **Webhook URL** | `https://your-domain.com/api/webhooks/github` |
| **Webhook secret** | Generate with: `openssl rand -hex 32` |

## Step 2: Configure Permissions

### Repository Permissions

| Permission | Access | Why |
|------------|--------|-----|
| **Contents** | Read | Read file contents for analysis |
| **Pull requests** | Read & Write | Post comments and suggestions |
| **Checks** | Read & Write | Create check runs |
| **Issues** | Read & Write | Link related issues |
| **Metadata** | Read | Access repository information |

### Organization Permissions (Optional)

| Permission | Access | Why |
|------------|--------|-----|
| **Members** | Read | Suggest reviewers from org |

### Account Permissions

None required.

## Step 3: Subscribe to Events

Check these webhook events:

- ✅ **Pull request**
- ✅ **Pull request review**
- ✅ **Pull request review comment**
- ✅ **Check run**
- ✅ **Check suite**

## Step 4: Generate Credentials

### Private Key

1. Scroll to **Private keys** section
2. Click **Generate a private key**
3. Save the downloaded `.pem` file securely

:::danger Keep Your Private Key Safe
Never commit the private key to version control. Use environment variables or a secrets manager.
:::

### Convert for Environment Variable

If storing as a single-line environment variable:

```bash
# Convert newlines to \n
awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}' your-app.pem
```

### Client ID and Secret (for OAuth)

If using the web dashboard:

1. Scroll to **Client secrets**
2. Click **Generate a new client secret**
3. Copy both the **Client ID** and **Client Secret**

## Step 5: Install the App

1. Go to your GitHub App's public page
2. Click **Install App**
3. Choose which repositories to enable:
   - **All repositories** — PRFlow on everything
   - **Only select repositories** — Choose specific repos

## Step 6: Configure PRFlow

Add the credentials to your environment:

```bash title=".env"
# GitHub App
GITHUB_APP_ID=123456
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----"
GITHUB_WEBHOOK_SECRET=your-generated-webhook-secret

# OAuth (for web dashboard)
GITHUB_CLIENT_ID=Iv1.abc123def456
GITHUB_CLIENT_SECRET=your-client-secret
```

For GitHub Actions with self-hosted PRFlow:

```yaml
- uses: prflow/action@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    prflow-token: ${{ secrets.PRFLOW_API_KEY }}
```

## Step 7: Verify Setup

### Test Webhook Delivery

1. Go to your GitHub App settings
2. Click **Advanced** → **Recent Deliveries**
3. Trigger a test event (open a PR)
4. Verify delivery shows `200 OK`

### Test API Connection

```bash
curl -X POST https://your-domain.com/api/health
# Expected: {"status":"ok"}

# With authentication
curl -H "Authorization: Bearer YOUR_API_KEY" \
  https://your-domain.com/api/repositories
```

---

## Troubleshooting

### Webhook Not Received

1. **Check URL** — Must be publicly accessible (not localhost)
2. **Check secret** — Must match exactly in GitHub and `.env`
3. **Check SSL** — Must be valid HTTPS certificate

### Permission Denied

1. **Check permissions** — Verify all required permissions are set
2. **Reinstall app** — Sometimes permissions don't update; reinstall on the repo
3. **Check installation** — Ensure app is installed on the specific repository

### Invalid Private Key

```
Error: secretOrPrivateKey must be an asymmetric key
```

1. **Check format** — Must include `-----BEGIN RSA PRIVATE KEY-----` headers
2. **Check newlines** — If single-line, use `\n` for line breaks
3. **Check encoding** — Must be PEM format, not DER

### Rate Limits

GitHub Apps have higher rate limits than `GITHUB_TOKEN`:

| Auth Method | Rate Limit |
|-------------|------------|
| GITHUB_TOKEN | 1,000/hour |
| GitHub App (installation) | 5,000/hour |
| GitHub App (user) | 5,000/hour |

---

## Security Best Practices

1. **Rotate secrets regularly** — Generate new webhook secrets and private keys periodically
2. **Use environment variables** — Never hardcode credentials
3. **Limit permissions** — Only request permissions you need
4. **Audit installations** — Periodically review which repos have the app installed
5. **Monitor webhook logs** — Watch for unusual patterns

---

## Next Steps

- [**Configuration**](/docs/guides/configuration) — Customize PRFlow settings
- [**Self-Hosting**](/docs/guides/self-hosting) — Deploy the full platform
- [**API Reference**](/docs/api-reference) — Programmatic access
