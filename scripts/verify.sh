#!/usr/bin/env bash
set -uo pipefail

# ─── Colors ────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

pass() { echo -e "  ${GREEN}✔${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; ERRORS=$((ERRORS + 1)); }
warn() { echo -e "  ${YELLOW}⚠${NC} $1"; }

ERRORS=0

echo ""
echo "╔══════════════════════════════════════╗"
echo "║     PRFlow — Setup Verification      ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ─── 1. .env file ─────────────────────────────────
echo -e "${CYAN}Environment${NC}"

if [ -f .env ]; then
  pass ".env file exists"
else
  fail ".env file missing — run: cp .env.example .env"
fi

if [ -f .env ]; then
  # Check required vars
  for var in DATABASE_URL REDIS_URL SESSION_SECRET; do
    val=$(grep "^${var}=" .env 2>/dev/null | cut -d= -f2-)
    if [ -n "$val" ]; then
      pass "${var} is set"
    else
      fail "${var} is not set in .env"
    fi
  done
fi

echo ""

# ─── 2. Docker containers ─────────────────────────
echo -e "${CYAN}Docker${NC}"

if command -v docker &> /dev/null && docker info &> /dev/null; then
  pass "Docker is running"

  if docker ps --format '{{.Names}}' | grep -q "prflow-postgres"; then
    pass "PostgreSQL container is running"
  else
    fail "PostgreSQL container not found — run: docker compose -f docker/docker-compose.yml up -d"
  fi

  if docker ps --format '{{.Names}}' | grep -q "prflow-redis"; then
    pass "Redis container is running"
  else
    fail "Redis container not found — run: docker compose -f docker/docker-compose.yml up -d"
  fi
else
  fail "Docker is not running — start Docker Desktop"
fi

echo ""

# ─── 3. Database connectivity ─────────────────────
echo -e "${CYAN}PostgreSQL${NC}"

if docker exec prflow-postgres pg_isready -U prflow -q 2>/dev/null; then
  pass "PostgreSQL is accepting connections"
else
  fail "PostgreSQL is not reachable — check docker logs prflow-postgres"
fi

echo ""

# ─── 4. Redis connectivity ────────────────────────
echo -e "${CYAN}Redis${NC}"

if docker exec prflow-redis redis-cli ping 2>/dev/null | grep -q PONG; then
  pass "Redis is responding"
else
  fail "Redis is not reachable — check docker logs prflow-redis"
fi

echo ""

# ─── 5. Prisma client ─────────────────────────────
echo -e "${CYAN}Prisma${NC}"

if [ -d "node_modules/.prisma/client" ] || [ -d "packages/db/node_modules/.prisma/client" ]; then
  pass "Prisma client is generated"
else
  fail "Prisma client not found — run: pnpm db:generate"
fi

echo ""

# ─── 6. Dependencies ──────────────────────────────
echo -e "${CYAN}Dependencies${NC}"

if [ -d "node_modules" ]; then
  pass "node_modules exists"
else
  fail "node_modules missing — run: pnpm install"
fi

echo ""

# ─── 7. API health (optional) ─────────────────────
echo -e "${CYAN}API (optional)${NC}"

if curl -s --max-time 2 http://localhost:3001/api/health > /dev/null 2>&1; then
  pass "API is responding at http://localhost:3001"
else
  warn "API is not running — start with: pnpm dev"
fi

echo ""

# ─── Summary ──────────────────────────────────────
if [ $ERRORS -eq 0 ]; then
  echo -e "${GREEN}All checks passed!${NC} Run ${CYAN}pnpm dev${NC} to start developing."
else
  echo -e "${RED}${ERRORS} check(s) failed.${NC} Fix the issues above and run ${CYAN}pnpm verify${NC} again."
fi
echo ""

exit $ERRORS
