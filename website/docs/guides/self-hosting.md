---
sidebar_position: 3
title: Self-Hosting
description: Deploy PRFlow on your own infrastructure
---

# Self-Hosting

Deploy PRFlow on your own infrastructure for full control over your data and analysis.

## Why Self-Host?

- **Data Privacy** — Code never leaves your network
- **Compliance** — Meet regulatory requirements (SOC2, HIPAA, etc.)
- **Customization** — Modify agents and rules for your needs
- **Cost Control** — Predictable infrastructure costs at scale
- **Air-Gapped** — Works without internet (except GitHub)

---

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | 20+ | LTS recommended |
| pnpm | 9+ | Package manager |
| Docker | 20+ | For containerized deployment |
| PostgreSQL | 15+ | Primary database |
| Redis | 7+ | Job queue and caching |

**Infrastructure requirements:**

| Component | CPU | Memory | Storage |
|-----------|-----|--------|---------|
| API Server | 2 cores | 2 GB | 1 GB |
| Worker (per) | 2 cores | 4 GB | 1 GB |
| PostgreSQL | 2 cores | 4 GB | 20+ GB |
| Redis | 1 core | 1 GB | 1 GB |

---

## Deployment Options

### Option 1: Docker Compose (Recommended for Small Teams)

The fastest way to deploy PRFlow:

```bash
# Clone the repository
git clone https://github.com/josedab/prflow.git
cd prflow

# Copy example environment
cp .env.example .env

# Edit configuration (see Environment Variables section)
nano .env

# Start all services
docker compose -f docker/docker-compose.yml up -d
```

**What's included:**
- API server
- Worker process
- PostgreSQL database
- Redis cache
- Nginx reverse proxy

```yaml title="docker/docker-compose.yml"
version: '3.8'

services:
  api:
    build:
      context: ..
      dockerfile: docker/Dockerfile
      target: api
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://prflow:${DB_PASSWORD}@postgres:5432/prflow
      - REDIS_URL=redis://redis:6379
    env_file:
      - ../.env
    depends_on:
      - postgres
      - redis
    restart: unless-stopped

  worker:
    build:
      context: ..
      dockerfile: docker/Dockerfile
      target: worker
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://prflow:${DB_PASSWORD}@postgres:5432/prflow
      - REDIS_URL=redis://redis:6379
    env_file:
      - ../.env
    depends_on:
      - postgres
      - redis
    restart: unless-stopped

  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_USER=prflow
      - POSTGRES_PASSWORD=${DB_PASSWORD}
      - POSTGRES_DB=prflow
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./certs:/etc/nginx/certs:ro
    depends_on:
      - api
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
```

### Option 2: Manual Deployment

For more control over individual components:

#### 1. Clone and Build

```bash
git clone https://github.com/josedab/prflow.git
cd prflow

# Install dependencies
pnpm install

# Build all packages
pnpm build
```

#### 2. Set Up PostgreSQL

```bash
# Using Docker
docker run -d \
  --name prflow-postgres \
  -e POSTGRES_USER=prflow \
  -e POSTGRES_PASSWORD=your-secure-password \
  -e POSTGRES_DB=prflow \
  -p 5432:5432 \
  -v prflow_postgres:/var/lib/postgresql/data \
  postgres:15-alpine

# Run migrations
DATABASE_URL=postgresql://prflow:your-secure-password@localhost:5432/prflow \
  pnpm db:migrate
```

#### 3. Set Up Redis

```bash
docker run -d \
  --name prflow-redis \
  -p 6379:6379 \
  -v prflow_redis:/data \
  redis:7-alpine \
  redis-server --appendonly yes
```

#### 4. Configure Environment

```bash title=".env"
# ===================
# Application
# ===================
NODE_ENV=production
PORT=3001
LOG_LEVEL=info

# ===================
# Database
# ===================
DATABASE_URL=postgresql://prflow:your-secure-password@localhost:5432/prflow

# ===================
# Redis
# ===================
REDIS_URL=redis://localhost:6379

# ===================
# GitHub App
# ===================
GITHUB_APP_ID=your-app-id
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA...
-----END RSA PRIVATE KEY-----"
GITHUB_WEBHOOK_SECRET=your-webhook-secret
GITHUB_CLIENT_ID=your-client-id
GITHUB_CLIENT_SECRET=your-client-secret

# ===================
# Session & Security
# ===================
SESSION_SECRET=generate-a-64-character-random-string

# ===================
# LLM (Optional)
# ===================
ENABLE_LLM_ANALYSIS=true
ENABLE_LLM_REVIEW=true
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
```

#### 5. Start Services

```bash
# API Server
pnpm --filter @prflow/api start

# Worker (in another terminal)
pnpm --filter @prflow/api worker

# Web Dashboard (optional)
pnpm --filter @prflow/web start
```

### Option 3: Kubernetes

For production deployments at scale:

```yaml title="k8s/deployment.yaml"
apiVersion: apps/v1
kind: Deployment
metadata:
  name: prflow-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: prflow-api
  template:
    metadata:
      labels:
        app: prflow-api
    spec:
      containers:
        - name: api
          image: ghcr.io/josedab/prflow-api:latest
          ports:
            - containerPort: 3001
          env:
            - name: NODE_ENV
              value: "production"
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: prflow-secrets
                  key: database-url
            - name: REDIS_URL
              valueFrom:
                secretKeyRef:
                  name: prflow-secrets
                  key: redis-url
          resources:
            requests:
              cpu: "500m"
              memory: "1Gi"
            limits:
              cpu: "2000m"
              memory: "4Gi"
          livenessProbe:
            httpGet:
              path: /api/health
              port: 3001
            initialDelaySeconds: 10
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /api/health/ready
              port: 3001
            initialDelaySeconds: 5
            periodSeconds: 5
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: prflow-worker
spec:
  replicas: 4
  selector:
    matchLabels:
      app: prflow-worker
  template:
    metadata:
      labels:
        app: prflow-worker
    spec:
      containers:
        - name: worker
          image: ghcr.io/josedab/prflow-worker:latest
          env:
            - name: NODE_ENV
              value: "production"
            # ... same env vars as API
          resources:
            requests:
              cpu: "1000m"
              memory: "2Gi"
            limits:
              cpu: "4000m"
              memory: "8Gi"
```

See our [Helm charts](https://github.com/josedab/prflow/tree/main/deploy/helm) for complete Kubernetes manifests.

---

## Reverse Proxy Setup

### Nginx

```nginx title="/etc/nginx/sites-available/prflow"
upstream prflow_api {
    server localhost:3001;
    keepalive 32;
}

server {
    listen 80;
    server_name prflow.yourcompany.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name prflow.yourcompany.com;

    ssl_certificate /etc/ssl/certs/prflow.crt;
    ssl_certificate_key /etc/ssl/private/prflow.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;

    # Webhook endpoint - needs to handle large payloads
    location /api/webhooks {
        proxy_pass http://prflow_api;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Large webhook payloads
        client_max_body_size 10M;
        proxy_read_timeout 60s;
    }

    location / {
        proxy_pass http://prflow_api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Caddy

```caddyfile title="Caddyfile"
prflow.yourcompany.com {
    reverse_proxy localhost:3001
    
    # Handle webhook timeouts
    @webhooks path /api/webhooks*
    handle @webhooks {
        reverse_proxy localhost:3001 {
            transport http {
                read_timeout 60s
            }
        }
    }
}
```

---

## Process Management

### Using PM2

```bash
# Install PM2
npm install -g pm2

# Start API
pm2 start "pnpm --filter @prflow/api start" \
  --name prflow-api \
  --max-memory-restart 2G

# Start Workers (multiple instances)
pm2 start "pnpm --filter @prflow/api worker" \
  --name prflow-worker \
  --instances 4 \
  --max-memory-restart 4G

# Start Web Dashboard
pm2 start "pnpm --filter @prflow/web start" \
  --name prflow-web

# Save process list
pm2 save

# Enable startup on reboot
pm2 startup
```

### Using systemd

```ini title="/etc/systemd/system/prflow-api.service"
[Unit]
Description=PRFlow API Server
After=network.target postgresql.service redis.service

[Service]
Type=simple
User=prflow
WorkingDirectory=/opt/prflow
Environment=NODE_ENV=production
EnvironmentFile=/opt/prflow/.env
ExecStart=/usr/bin/pnpm --filter @prflow/api start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable prflow-api
sudo systemctl start prflow-api
```

---

## Database Management

### Backups

```bash
# Backup
pg_dump -h localhost -U prflow prflow | gzip > backup_$(date +%Y%m%d).sql.gz

# Automated daily backup
cat > /etc/cron.daily/prflow-backup << 'EOF'
#!/bin/bash
BACKUP_DIR=/var/backups/prflow
pg_dump -h localhost -U prflow prflow | gzip > $BACKUP_DIR/prflow_$(date +%Y%m%d_%H%M%S).sql.gz
find $BACKUP_DIR -mtime +30 -delete  # Keep 30 days
EOF
chmod +x /etc/cron.daily/prflow-backup
```

### Restore

```bash
# Restore from backup
gunzip < backup_20240115.sql.gz | psql -h localhost -U prflow prflow
```

### Migrations

```bash
# Run pending migrations
DATABASE_URL=your-connection-string pnpm db:migrate

# Check migration status
DATABASE_URL=your-connection-string pnpm db:status
```

---

## Monitoring

### Health Endpoints

```bash
# Liveness probe
curl http://localhost:3001/api/health
# {"status":"ok","timestamp":"2024-01-15T10:30:00Z"}

# Readiness probe
curl http://localhost:3001/api/health/ready
# {"status":"ok","database":"connected","redis":"connected"}

# Metrics (Prometheus format)
curl http://localhost:3001/api/metrics
```

### Prometheus Configuration

```yaml title="prometheus.yml"
scrape_configs:
  - job_name: 'prflow'
    static_configs:
      - targets: ['localhost:3001']
    metrics_path: /api/metrics
```

### Key Metrics

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| `prflow_queue_depth` | Jobs waiting in queue | > 100 |
| `prflow_job_duration_seconds` | Job processing time | > 120s |
| `prflow_api_request_duration_seconds` | API response time | > 5s |
| `prflow_errors_total` | Error count | > 10/min |

### Logging

PRFlow outputs structured JSON logs:

```json
{
  "level": "info",
  "time": "2024-01-15T10:30:00.000Z",
  "msg": "PR analysis completed",
  "repository": "owner/repo",
  "pr_number": 123,
  "duration_ms": 45000,
  "issues_found": 5
}
```

Aggregate with your preferred log management (ELK, Loki, Datadog, etc.).

---

## Scaling

### Horizontal Scaling

```mermaid
flowchart TB
    LB[Load Balancer]
    
    subgraph API Tier
        A1[API 1]
        A2[API 2]
        A3[API 3]
    end
    
    subgraph Worker Tier
        W1[Worker 1]
        W2[Worker 2]
        W3[Worker 3]
        W4[Worker 4]
    end
    
    subgraph Data Tier
        PG[(PostgreSQL)]
        RD[(Redis)]
    end
    
    LB --> A1 & A2 & A3
    A1 & A2 & A3 --> RD
    W1 & W2 & W3 & W4 --> RD
    A1 & A2 & A3 --> PG
```

### Scaling Guidelines

| Scale | Repositories | API Instances | Workers | PostgreSQL | Redis |
|-------|--------------|---------------|---------|------------|-------|
| Small | Up to 100 | 1 | 2 | Single | Single |
| Medium | 100-1000 | 2-3 | 4-8 | Primary + Replica | Single |
| Large | 1000+ | 3+ | 8+ | Cluster | Cluster |

### Worker Autoscaling

Scale workers based on queue depth:

```yaml title="k8s/hpa.yaml"
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: prflow-worker-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: prflow-worker
  minReplicas: 2
  maxReplicas: 20
  metrics:
    - type: External
      external:
        metric:
          name: redis_queue_depth
          selector:
            matchLabels:
              queue: prflow-jobs
        target:
          type: AverageValue
          averageValue: 10
```

---

## Security Hardening

### Network Security

```bash
# Firewall rules (ufw)
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp    # SSH
ufw allow 443/tcp   # HTTPS
ufw enable
```

### Secret Management

Use a secrets manager:

```bash
# Vault example
vault kv put secret/prflow \
  database_url="postgresql://..." \
  github_private_key="@private-key.pem" \
  openai_api_key="sk-..."

# Kubernetes secrets
kubectl create secret generic prflow-secrets \
  --from-literal=database-url="postgresql://..." \
  --from-file=github-private-key=./private-key.pem
```

### Security Checklist

- [ ] HTTPS only (no HTTP)
- [ ] Webhook signature verification enabled
- [ ] Database encrypted at rest
- [ ] Redis password protected
- [ ] Regular security updates
- [ ] Audit logging enabled
- [ ] Rate limiting configured
- [ ] No secrets in code or logs

---

## Updating PRFlow

```bash
# Pull latest changes
cd /opt/prflow
git pull origin main

# Install dependencies
pnpm install

# Build
pnpm build

# Run migrations
pnpm db:migrate

# Restart services
pm2 restart all

# Or with Docker
docker compose pull
docker compose up -d
```

---

## Troubleshooting

### Common Issues

**Database connection failed:**
```bash
# Check PostgreSQL is running
docker ps | grep postgres
# Check connection
psql -h localhost -U prflow -d prflow -c "SELECT 1"
```

**Redis connection failed:**
```bash
# Check Redis is running
docker ps | grep redis
# Check connection
redis-cli ping
```

**Webhooks not received:**
1. Verify webhook URL is accessible from internet
2. Check GITHUB_WEBHOOK_SECRET matches GitHub App settings
3. Look for errors in API logs

**Jobs stuck in queue:**
```bash
# Check queue status
redis-cli LLEN bull:prflow:wait
# Check for failed jobs
redis-cli LLEN bull:prflow:failed
```

---

## Next Steps

- [**GitHub App Setup**](/docs/getting-started/github-app-setup) — Configure GitHub integration
- [**Configuration**](/docs/guides/configuration) — All config options
- [**API Reference**](/docs/api-reference) — REST API documentation
