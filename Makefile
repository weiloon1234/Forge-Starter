# =============================================================================
# Forge Starter — Development Commands
# =============================================================================
# Run: make <target>
# =============================================================================

.PHONY: help setup dev dev\:api dev\:admin dev\:user build check api-docs types migrate seed routes deploy clean

# Default: show help
help:
	@echo ""
	@echo "  make setup        First-time setup (publish migrations, generate keys)"
	@echo ""
	@echo "  make dev          Start ALL (backend + admin + user) in one terminal"
	@echo "  make dev:api      Backend API only (:3000)"
	@echo "  make dev:admin    Admin frontend only (:5173)"
	@echo "  make dev:user     User frontend only (:5174)"
	@echo ""
	@echo "  make build        Build release binary + frontends"
	@echo "  make check        Type-check without building"
	@echo "  make api-docs     Generate API docs at docs/api/"
	@echo "  make types        Generate TypeScript types from Rust DTOs"
	@echo "  make migrate      Run database migrations"
	@echo "  make seed         Run database seeders"
	@echo "  make routes       List all registered routes"
	@echo "  make deploy       Build & deploy to R2 (interactive)"
	@echo "  make clean        Clean build artifacts"
	@echo ""

# First-time setup after clone
setup:
	PROCESS=cli cargo run -- key:generate
	PROCESS=cli cargo run -- migrate:publish
	PROCESS=cli cargo run -- db:migrate
	@echo "Setup complete. Run 'make dev' to start."

# Start everything — generate types, then all processes + frontend portals
dev: types
	@echo "Starting backend (:3000) + websocket (:3010) + scheduler + admin (:5173) + user (:5174)..."
	@echo "Visit http://localhost:5173/admin/ or http://localhost:5174/"
	@trap 'kill 0' EXIT; \
	(cd frontend/admin && exec npm run dev) & \
	(cd frontend/user && exec npm run dev) & \
	(PROCESS=websocket exec cargo run) & \
	(PROCESS=scheduler exec cargo run) & \
	cargo run

# Backend API only
dev\:api:
	cargo run

# Frontend dev servers (Vite hot reload)
dev\:admin:
	cd frontend/admin && npm run dev

dev\:user:
	cd frontend/user && npm run dev

# Release build — generate types, build frontends, then Rust binary
build: types
	cd frontend/admin && npm run build
	cd frontend/user && npm run build
	cargo build --release

# Type-check only (fast)
check:
	cargo check

# Generate API docs
# Output: docs/api/index.md + docs/api/modules/*.md
api-docs:
	cargo run -- docs:api

# Generate TypeScript types (auto-discovered from ApiSchema + AppEnum + forge::TS derives)
# Output: frontend/shared/types/generated/*.ts
types:
	@PROCESS=cli cargo run -- types:export

# Database migrations
migrate:
	PROCESS=cli cargo run -- db:migrate

# Database seeders
seed:
	PROCESS=cli cargo run -- db:seed

# List all routes
routes:
	PROCESS=cli cargo run -- routes:list

# Build & deploy to R2
deploy:
	bash scripts/build.sh

# Clean
clean:
	cargo clean
