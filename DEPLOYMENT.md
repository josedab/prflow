# Deployment Guide

This guide covers deploying PRFlow to production environments.

## Prerequisites

- Node.js 20+
- PostgreSQL 14+
- Redis 6+
- Docker (optional, for containerized deployment)

## Environment Variables

Create a `.env` file with the following variables:

```bash
# Application
NODE_ENV=production
PORT=3001

# Database
DATABASE_URL=postgresql://user:password@host:5432/prflow

# Redis
REDIS_URL=redis://host:6379

# GitHub App (required)
GITHUB_APP_ID=your-app-id
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
GITHUB_WEBHOOK_SECRET=your-webhook-secret
GITHUB_CLIENT_ID=your-client-id
GITHUB_CLIENT_SECRET=your-client-secret

# LLM Provider (at least one required for full functionality)
OPENAI_API_KEY=sk-...
# or
ANTHROPIC_API_KEY=sk-ant-...

# Session
SESSION_SECRET=your-session-secret-at-least-32-characters

# Optional
LOG_LEVEL=info
```

## Deployment Options

### Option 1: Docker Compose (Recommended for Small Teams)

```bash
# Clone the repository
git clone https://github.com/josedab/prflow.git
cd prflow

# Copy environment file
cp .env.example .env
# Edit .env with your values

# Start all services
docker compose -f docker/docker-compose.prod.yml up -d
```

### Option 2: Kubernetes (Recommended for Enterprise)

1. **Create namespace:**
   ```bash
   kubectl create namespace prflow
   ```

2. **Create secrets:**
   ```bash
   kubectl create secret generic prflow-secrets \
     --from-literal=database-url='postgresql://...' \
     --from-literal=github-app-private-key='...' \
     --from-literal=github-webhook-secret='...' \
     --namespace prflow
   ```

3. **Deploy:**
   ```bash
   kubectl apply -f docker/k8s/ -n prflow
   ```

### Option 3: Platform-as-a-Service

#### Railway

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/prflow)

1. Click the button above
2. Configure environment variables
3. Deploy

#### Render

1. Create a new Web Service
2. Connect your fork of PRFlow
3. Configure environment variables
4. Deploy

#### Fly.io

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Login
fly auth login

# Deploy
fly launch --config docker/fly.toml
fly secrets set GITHUB_APP_PRIVATE_KEY="..."
fly deploy
```

## Database Setup

### Migrations

```bash
# Run migrations
pnpm db:migrate

# Or with Docker
docker compose exec api pnpm db:migrate
```

### Backup & Recovery

```bash
# Backup
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql

# Restore
psql $DATABASE_URL < backup-20240101.sql
```

## GitHub App Setup

1. Go to https://github.com/settings/apps
2. Click "New GitHub App"
3. Configure:
   - **Name:** PRFlow (josedab)
   - **Homepage URL:** https://your-prflow-domain.com
   - **Webhook URL:** https://your-prflow-domain.com/api/webhooks/github
   - **Webhook secret:** (generate a secure random string)

4. **Permissions:**
   - Repository:
     - Contents: Read
     - Pull requests: Read & Write
     - Checks: Read & Write
     - Issues: Read & Write
   - Organization:
     - Members: Read

5. **Subscribe to events:**
   - Pull request
   - Pull request review
   - Check run
   - Check suite

6. Generate and download private key
7. Note the App ID and Client ID

## SSL/TLS Configuration

### With Reverse Proxy (nginx)

```nginx
server {
    listen 443 ssl http2;
    server_name prflow.yourdomain.com;
    
    ssl_certificate /etc/letsencrypt/live/prflow.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/prflow.yourdomain.com/privkey.pem;
    
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
    
    # WebSocket support
    location /ws {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## Monitoring

### Health Checks

- **Liveness:** `GET /api/health`
- **Readiness:** `GET /api/health/ready`

### Prometheus Metrics

Metrics are exposed at `/metrics` (if enabled):

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'prflow'
    static_configs:
      - targets: ['prflow-api:3001']
```

### Logging

Logs are output in JSON format. Configure your log aggregator:

```bash
# Example with Docker logging
docker compose logs -f api | jq .
```

## Scaling

### Horizontal Scaling

PRFlow API is stateless and can be horizontally scaled:

```yaml
# docker-compose.prod.yml
services:
  api:
    deploy:
      replicas: 3
```

### Redis Cluster

For high availability, use Redis Cluster or Redis Sentinel:

```bash
REDIS_URL=redis://node1:6379,node2:6379,node3:6379
```

### Database Read Replicas

Configure read replicas for analytics queries:

```bash
DATABASE_URL=postgresql://user:pass@primary:5432/prflow
DATABASE_REPLICA_URL=postgresql://user:pass@replica:5432/prflow
```

## Troubleshooting

### Common Issues

1. **Webhook not receiving events:**
   - Check webhook URL is accessible from internet
   - Verify webhook secret matches
   - Check GitHub App is installed on repository

2. **Database connection errors:**
   - Verify DATABASE_URL is correct
   - Check network connectivity
   - Ensure database allows connections from app server

3. **LLM API errors:**
   - Check API key is valid
   - Verify rate limits haven't been exceeded
   - Check model availability

### Debug Mode

```bash
# Enable debug logging
LOG_LEVEL=debug NODE_ENV=development pnpm dev
```

## Security Checklist

- [ ] All secrets stored securely (not in code)
- [ ] HTTPS enabled
- [ ] Database connections encrypted
- [ ] Rate limiting configured
- [ ] Webhook signature verification enabled
- [ ] Session secrets are unique per environment
- [ ] Regular security updates applied
