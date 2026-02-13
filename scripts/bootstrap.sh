#!/usr/bin/env bash
set -euo pipefail

# ─── Colors ────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

info()  { echo -e "${CYAN}ℹ${NC} $1"; }
ok()    { echo -e "${GREEN}✔${NC} $1"; }
warn()  { echo -e "${YELLOW}⚠${NC} $1"; }
fail()  { echo -e "${RED}✗${NC} $1"; exit 1; }

echo ""
echo "╔══════════════════════════════════════╗"
echo "║     PRFlow — Development Setup       ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ─── Check prerequisites ──────────────────────────

info "Checking prerequisites..."

# Node.js
if ! command -v node &> /dev/null; then
  fail "Node.js is not installed. Install Node.js 20+ from https://nodejs.org"
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  fail "Node.js 20+ required (found v$(node -v | sed 's/v//')). Run: nvm install 20"
fi
ok "Node.js $(node -v)"

# pnpm
if ! command -v pnpm &> /dev/null; then
  warn "pnpm not found. Enabling via corepack..."
  corepack enable
  if ! command -v pnpm &> /dev/null; then
    fail "Could not enable pnpm. Install it: npm install -g pnpm@9"
  fi
fi

PNPM_VERSION=$(pnpm -v | cut -d. -f1)
if [ "$PNPM_VERSION" -lt 9 ]; then
  fail "pnpm 9+ required (found $(pnpm -v)). Run: npm install -g pnpm@9"
fi
ok "pnpm $(pnpm -v)"

# Docker
if ! command -v docker &> /dev/null; then
  fail "Docker is not installed. Install Docker from https://docker.com"
fi

if ! docker info &> /dev/null; then
  fail "Docker is not running. Start Docker Desktop and try again."
fi
ok "Docker is running"

echo ""

# ─── Install dependencies ─────────────────────────

info "Installing dependencies..."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install
ok "Dependencies installed"

# ─── Start infrastructure ─────────────────────────

info "Starting PostgreSQL and Redis..."
docker compose -f docker/docker-compose.yml up -d

# Wait for Postgres to be ready
info "Waiting for PostgreSQL to be ready..."
RETRIES=30
until docker exec prflow-postgres pg_isready -U prflow -q 2>/dev/null || [ $RETRIES -eq 0 ]; do
  RETRIES=$((RETRIES - 1))
  sleep 1
done

if [ $RETRIES -eq 0 ]; then
  fail "PostgreSQL did not become ready in time. Check: docker compose -f docker/docker-compose.yml logs postgres"
fi
ok "PostgreSQL is ready"

# Wait for Redis to be ready
RETRIES=15
until docker exec prflow-redis redis-cli ping 2>/dev/null | grep -q PONG || [ $RETRIES -eq 0 ]; do
  RETRIES=$((RETRIES - 1))
  sleep 1
done

if [ $RETRIES -eq 0 ]; then
  fail "Redis did not become ready in time. Check: docker compose -f docker/docker-compose.yml logs redis"
fi
ok "Redis is ready"

echo ""

# ─── Setup environment ────────────────────────────

if [ ! -f .env ]; then
  info "Creating .env from .env.example..."
  cp .env.example .env
  ok ".env file created"
else
  ok ".env file already exists (keeping existing)"
fi

# ─── Initialize database ──────────────────────────

info "Generating Prisma client..."
pnpm db:generate
ok "Prisma client generated"

info "Running database migrations..."
if ! pnpm db:migrate; then
  fail "Database migration failed. Check Postgres is running: docker compose -f docker/docker-compose.yml logs postgres"
fi
ok "Database migrations applied"

# Seed if available
if grep -q '"db:seed"' package.json 2>/dev/null; then
  info "Seeding database with demo data..."
  pnpm db:seed
  ok "Database seeded"
fi

echo ""
echo "╔══════════════════════════════════════╗"
echo "║         Setup Complete! 🎉           ║"
echo "╚══════════════════════════════════════╝"
echo ""
echo -e "  ${CYAN}API:${NC}        http://localhost:3001"
echo -e "  ${CYAN}Dashboard:${NC}  http://localhost:3000"
echo -e "  ${CYAN}PostgreSQL:${NC} localhost:5432"
echo -e "  ${CYAN}Redis:${NC}      localhost:6379"
echo ""
echo -e "  ${GREEN}Next step:${NC}  pnpm dev"
echo ""

if ! grep -q "GITHUB_APP_ID=" .env 2>/dev/null || [ -z "$(grep 'GITHUB_APP_ID=' .env | cut -d= -f2)" ]; then
  info "GitHub App not configured — the app will start in local exploration mode."
  echo "  To enable GitHub integration later, edit .env and set GITHUB_APP_* variables."
  echo "  See: README.md#github-app-setup"
  echo ""
fi
