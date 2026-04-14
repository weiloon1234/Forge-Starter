# =============================================================================
# Forge Starter — Development Commands
# =============================================================================
# Equivalent of Laravel's composer scripts / npm scripts.
# Run: make <target>
# =============================================================================

.PHONY: help dev build check api-docs types migrate seed routes deploy clean

# Default: show help
help:
	@echo ""
	@echo "  make dev          Start development server"
	@echo "  make build        Build release binary"
	@echo "  make check        Type-check without building"
	@echo "  make api-docs     Generate LLM-friendly API docs at docs/api/"
	@echo "  make types        Generate TypeScript types from Rust DTOs"
	@echo "  make migrate      Run database migrations"
	@echo "  make seed          Run database seeders"
	@echo "  make routes       List all registered routes"
	@echo "  make deploy       Build & deploy to R2 (interactive)"
	@echo "  make clean        Clean build artifacts"
	@echo ""

# Development server (HTTP)
dev:
	cargo run

# Release build
build:
	cargo build --release

# Type-check only (fast)
check:
	cargo check

# Generate API docs (LLM-friendly markdown from cargo doc)
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
	cargo run -- db:migrate

# Database seeders
seed:
	cargo run -- db:seed

# List all routes
routes:
	cargo run -- routes:list

# Build & deploy to R2
deploy:
	bash scripts/build.sh

# Clean
clean:
	cargo clean
