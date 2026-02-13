# Convenience aliases for pnpm scripts. See package.json for the source of truth.
.PHONY: help setup verify dev dev-api dev-web test test-unit lint lint-fix format build clean db-up db-down db-reset db-generate db-migrate db-seed db-studio

# Default target
help: ## Show this help
	@echo ""
	@echo "PRFlow — Development Commands"
	@echo "============================="
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'
	@echo ""

# ─── Setup ─────────────────────────────────────────

setup: ## Full setup: install deps, start Docker, init DB
	@bash scripts/bootstrap.sh

verify: ## Verify setup: check Docker, DB, Redis, .env, Prisma
	@bash scripts/verify.sh

# ─── Development ───────────────────────────────────

dev: ## Start all services (API + Dashboard)
	pnpm dev

dev-api: ## Start API server only
	pnpm --filter @prflow/api dev

dev-web: ## Start web dashboard only
	pnpm --filter @prflow/web dev

# ─── Testing ───────────────────────────────────────

test: ## Run all tests
	pnpm test

test-unit: ## Run unit tests (no Docker needed)
	pnpm --filter @prflow/api test -- --testPathPattern='__tests__/(?!routes)' --run

lint: ## Run ESLint on all packages
	pnpm lint

lint-fix: ## Auto-fix linting issues
	pnpm lint -- --fix

format: ## Format code with Prettier
	pnpm format

# ─── Building ──────────────────────────────────────

build: ## Build all packages
	pnpm build

clean: ## Remove build artifacts and node_modules
	pnpm clean

# ─── Database ──────────────────────────────────────

db-up: ## Start PostgreSQL and Redis via Docker
	docker compose -f docker/docker-compose.yml up -d

db-down: ## Stop PostgreSQL and Redis
	docker compose -f docker/docker-compose.yml down

db-reset: ## Reset database: drop, migrate, and seed
	docker compose -f docker/docker-compose.yml down -v
	docker compose -f docker/docker-compose.yml up -d
	@echo "Waiting for Postgres to be ready..."
	@sleep 3
	pnpm db:generate
	pnpm db:migrate
	@if grep -q '"db:seed"' package.json 2>/dev/null; then pnpm db:seed; fi

db-generate: ## Generate Prisma client
	pnpm db:generate

db-migrate: ## Run database migrations
	pnpm db:migrate

db-seed: ## Seed database with demo data
	pnpm db:seed

db-studio: ## Open Prisma Studio (DB browser)
	pnpm --filter @prflow/db studio
