---
sidebar_position: 100
title: Troubleshooting
description: Solutions to common PRFlow issues
---

# Troubleshooting

Find solutions to common issues when using PRFlow.

## Quick Diagnostics

Before diving into specific issues, try these quick checks:

```bash
# Check PRFlow version
prflow --version

# Check health (self-hosted)
curl https://your-domain.com/api/health

# Check GitHub Actions logs
# Go to: GitHub repo → Actions → PRFlow workflow → Click on failed run
```

---

## GitHub Action Issues

### PRFlow Doesn't Run on My PR

**Symptoms:** No check appears, no comments posted, workflow doesn't trigger.

**Possible causes and solutions:**

| Cause | Solution |
|-------|----------|
| Workflow file not found | Ensure `.github/workflows/prflow.yml` exists |
| Wrong trigger events | Check `on: pull_request: types: [...]` |
| Branch protection | Verify workflow runs on your branch |
| PR is draft | Set `skip-draft: false` or mark PR ready |
| PR is from fork | Set `skip-forks: false` (security implications) |
| Skip label present | Remove `skip-prflow` or similar labels |

**Debug steps:**

1. Go to **Actions** tab in your repository
2. Check if the workflow appears in the list
3. If triggered, click to see logs
4. Look for skipped steps or errors

### Permission Denied Errors

**Symptoms:**
```
Error: Resource not accessible by integration
```

**Solution:** Ensure your workflow has required permissions:

```yaml
jobs:
  prflow:
    permissions:
      contents: read        # Read repository files
      pull-requests: write  # Post comments
      checks: write         # Create check runs
```

For fine-grained tokens, also enable:
- Repository: Read access to code and metadata
- Pull requests: Read and write access
- Checks: Read and write access

### PRFlow Posts Too Many Comments

**Symptoms:** PR is flooded with inline comments.

**Solution:** Configure limits:

```yaml
- uses: prflow/action@v1
  with:
    max-comments: 10
    severity-threshold: high  # Only high/critical
```

Or in `.github/prflow.yml`:

```yaml
outputs:
  inline_comments:
    max_comments: 10
    severity_threshold: high
    collapse_low_severity: true
```

### PRFlow Blocks All My PRs

**Symptoms:** Every PR fails the PRFlow check.

**Possible causes:**

1. **Critical issues detected** — Review and fix the issues
2. **Configuration too strict** — Adjust severity settings
3. **False positives** — Report and adjust patterns

**Temporary workaround:**

```yaml
- uses: prflow/action@v1
  with:
    block-on-critical: false
    fail-on-high: false
```

**Better solution:** Fix the underlying issues or adjust patterns:

```yaml
agents:
  reviewer:
    ignore_patterns:
      - '**/legacy/**'  # Skip legacy code
```

### Rate Limit Exceeded

**Symptoms:**
```
Error: API rate limit exceeded
```

**Solution:**

1. Reduce API calls:
   ```yaml
   - uses: prflow/action@v1
     with:
       max-comments: 10
   ```

2. For high-volume repos, use a GitHub App token instead of `GITHUB_TOKEN`

3. Consider self-hosting for unlimited processing

---

## Self-Hosted Issues

### Database Connection Failed

**Symptoms:**
```
Error: Connection refused to localhost:5432
Error: ECONNREFUSED ::1:5432
```

**Solution:**

```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# Check container logs
docker logs prflow-postgres

# Restart container
docker compose -f docker/docker-compose.yml restart postgres

# Verify connection
psql -h localhost -U prflow -d prflow -c "SELECT 1"
```

**If using local PostgreSQL:**

```bash
# macOS
brew services list | grep postgresql
brew services restart postgresql@15

# Linux
sudo systemctl status postgresql
sudo systemctl restart postgresql
```

### Redis Connection Failed

**Symptoms:**
```
Error: Connection refused to localhost:6379
ECONNREFUSED
```

**Solution:**

```bash
# Check if Redis is running
docker ps | grep redis

# Test connection
redis-cli ping
# Should return: PONG

# Check logs
docker logs prflow-redis

# Restart
docker compose -f docker/docker-compose.yml restart redis
```

### Webhook Verification Failed

**Symptoms:**
```
Error: Invalid webhook signature
Error: Request body was not signed correctly
```

**Causes and solutions:**

| Cause | Solution |
|-------|----------|
| Secret mismatch | Verify `GITHUB_WEBHOOK_SECRET` matches GitHub App settings |
| Proxy modifying body | Configure proxy to preserve raw body |
| Encoding issue | Ensure JSON content-type handling |

**Verify secret:**

1. Go to GitHub App settings
2. Find webhook secret
3. Compare with `GITHUB_WEBHOOK_SECRET` in your `.env`
4. Regenerate if unsure

**Proxy configuration (nginx):**

```nginx
location /api/webhooks {
    proxy_pass http://localhost:3001;
    proxy_set_header Content-Type application/json;
    # Don't modify request body
    proxy_request_buffering off;
}
```

### "App Not Installed" Errors

**Symptoms:**
```
Error: This GitHub App is not installed on this repository
```

**Solution:**

1. Go to your GitHub App settings on GitHub
2. Click **Install App** in the sidebar
3. Select the organization/user
4. Choose **All repositories** or select specific ones
5. Confirm installation

### Workers Not Processing Jobs

**Symptoms:** Jobs stuck in queue, no analysis happening.

**Debug steps:**

```bash
# Check queue depth
redis-cli LLEN bull:prflow:wait

# Check for failed jobs
redis-cli LLEN bull:prflow:failed

# View failed job details
redis-cli LRANGE bull:prflow:failed 0 10

# Check worker logs
docker logs prflow-worker
# Or: pm2 logs prflow-worker
```

**Solutions:**

1. Restart workers:
   ```bash
   pm2 restart prflow-worker
   # Or
   docker compose restart worker
   ```

2. Clear stuck jobs:
   ```bash
   redis-cli DEL bull:prflow:wait bull:prflow:active
   ```

3. Check for resource issues:
   ```bash
   # Memory
   free -h
   # CPU
   top -p $(pgrep -f prflow)
   ```

### SSL Certificate Errors

**Symptoms:**
```
Error: unable to verify the first certificate
CERT_HAS_EXPIRED
```

**Solutions:**

1. Update certificates:
   ```bash
   # Let's Encrypt
   certbot renew
   
   # Manual certs
   # Check expiry
   openssl x509 -enddate -noout -in /path/to/cert.pem
   ```

2. For self-signed certs in development:
   ```bash
   NODE_TLS_REJECT_UNAUTHORIZED=0 pnpm start  # Not for production!
   ```

---

## LLM Issues

### LLM Requests Failing

**Symptoms:**
```
Error: OpenAI API rate limit exceeded
Error: 429 Too Many Requests
```

**Solutions:**

1. **Check API quota** — Visit OpenAI/Anthropic dashboard
2. **Reduce concurrent requests:**
   ```bash
   LLM_MAX_CONCURRENT=2
   ```
3. **Use fallback mode:**
   ```bash
   ENABLE_LLM_REVIEW=false  # Pattern-only analysis
   ```

### LLM Responses Are Slow

**Symptoms:** Analysis takes >60 seconds.

**Solutions:**

1. **Disable LLM for speed:**
   ```bash
   ENABLE_LLM_ANALYSIS=false
   ENABLE_LLM_REVIEW=false
   ```

2. **Use faster model:**
   ```bash
   LLM_MODEL=gpt-3.5-turbo  # Instead of gpt-4
   ```

3. **Reduce context:**
   ```yaml
   agents:
     reviewer:
       max_file_size: 10000  # Limit file size analyzed
   ```

### LLM Returns Poor Results

**Symptoms:** False positives, missed issues, unhelpful suggestions.

**Solutions:**

1. **Check model version:**
   ```bash
   LLM_MODEL=gpt-4-turbo  # Use latest model
   ```

2. **Provide more context:**
   ```yaml
   agents:
     reviewer:
       include_file_context: true
       context_lines: 50
   ```

3. **Report issues** — Help improve prompts by reporting problems

---

## Common Error Codes

| Code | Description | Solution |
|------|-------------|----------|
| `REPO_NOT_FOUND` | Repository not in database | Re-install GitHub App on repository |
| `INVALID_TOKEN` | API key invalid or expired | Generate new API key in dashboard |
| `RATE_LIMITED` | Too many requests | Wait, upgrade plan, or self-host |
| `WEBHOOK_FAILED` | Webhook delivery failed | Check endpoint, verify secret |
| `ANALYSIS_TIMEOUT` | Processing took too long | Increase timeout or reduce scope |
| `DIFF_TOO_LARGE` | PR diff exceeds limit | Split PR or increase limit |
| `AGENT_FAILED` | Agent execution error | Check logs for specific error |
| `GITHUB_API_ERROR` | GitHub API returned error | Check token permissions, rate limits |

---

## Debug Mode

Enable debug logging for more details:

**GitHub Action:**
```yaml
- uses: prflow/action@v1
  with:
    debug: true
```

**Self-hosted:**
```bash
LOG_LEVEL=debug pnpm start
```

**What to look for:**
- Request/response payloads
- Agent execution times
- Error stack traces
- GitHub API calls

---

## Performance Issues

### Analysis Is Slow

**Typical times:**
- Small PR (under 10 files): 20-40 seconds
- Medium PR (10-50 files): 40-90 seconds
- Large PR (50+ files): 90-180 seconds

**If slower than expected:**

1. **Check LLM latency:**
   ```bash
   # Disable LLM to test
   ENABLE_LLM_REVIEW=false pnpm start
   ```

2. **Check GitHub API:**
   ```bash
   # Test API response time
   time curl -H "Authorization: token $TOKEN" \
     https://api.github.com/repos/owner/repo
   ```

3. **Check database:**
   ```bash
   # Test query time
   psql -c "EXPLAIN ANALYZE SELECT * FROM workflows LIMIT 1"
   ```

### High Memory Usage

**Symptoms:** OOM errors, slow performance.

**Solutions:**

1. **Limit concurrent jobs:**
   ```bash
   WORKER_CONCURRENCY=2  # Default is 5
   ```

2. **Increase memory limit:**
   ```bash
   NODE_OPTIONS="--max-old-space-size=4096"
   ```

3. **Use streaming for large diffs:**
   ```yaml
   workflow:
     streaming: true
     chunk_size: 1000
   ```

---

## Getting Help

If you can't resolve your issue:

### 1. Check Existing Resources

- [GitHub Issues](https://github.com/josedab/prflow/issues) — Search for similar problems
- [GitHub Discussions](https://github.com/josedab/prflow/discussions) — Community Q&A
- [Documentation](/) — Full reference

### 2. Gather Information

Before reporting, collect:

- PRFlow version
- Node.js version
- Error messages (full stack trace)
- Steps to reproduce
- Relevant configuration (redact secrets)
- Logs (API, worker, action)

### 3. Report the Issue

[Open a GitHub issue](https://github.com/josedab/prflow/issues/new) with:

```markdown
**Environment**
- PRFlow version: 
- Node.js version: 
- OS: 

**Description**
What happened vs. what you expected.

**Steps to Reproduce**
1. 
2. 
3. 

**Error Messages**
```
Paste error here
```

**Configuration**
```yaml
# Relevant config (redact secrets)
```

**Logs**
```
Relevant log output
```
```

---

## Next Steps

- [**FAQ**](/docs/faq) — Frequently asked questions
- [**Configuration**](/docs/guides/configuration) — All config options
- [**Contributing**](/docs/contributing/overview) — Help improve PRFlow
