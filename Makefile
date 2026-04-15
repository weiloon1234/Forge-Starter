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
	@echo "  make build        Build release binary"
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

# Start everything — backend + all frontend portals (single terminal, Ctrl+C kills all)
dev:
	@echo "Starting backend (:3000) + admin (:5173) + user (:5174)..."
	@echo "Visit http://localhost:5173/admin/ or http://localhost:5174/"
	@trap 'kill 0' EXIT; \
	(cd frontend/admin && exec npm run dev) & \
	(cd frontend/user && exec npm run dev) & \
	cargo run

# Backend API only
dev\:api:
	cargo run

# Frontend dev servers (Vite hot reload)
dev\:admin:
	cd frontend/admin && npm run dev

dev\:user:
	cd frontend/user && npm run dev

# Release build
build:
	cargo build --release

# Type-check only (fast)
check:
	cargo check

# Generate API docs
# Output: docs/api/index.md + docs/api/modules/*.md
api-docs:
	cargo run -- docs:api

# Generate TypeScript types from Rust DTOs
# Output: frontend/shared/types/generated/*.ts
types:
	TS_RS_EXPORT_DIR="$$(pwd)/frontend/shared/types/generated" cargo test export_typescript_bindings -- --nocapture
	@echo "// Auto-generated barrel. Do not edit." > frontend/shared/types/generated/index.ts
	@ls frontend/shared/types/generated/*.ts | grep -v index.ts | sed 's|.*/||;s|\.ts$$||' | while read name; do \
		echo "export type { $$name } from \"./$$name\";" >> frontend/shared/types/generated/index.ts; \
	done
	@echo "TypeScript types generated at frontend/shared/types/generated/"

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
