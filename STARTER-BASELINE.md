# Forge Starter Consistency Baseline

This starter is the team reference implementation for Forge-first Rust and system-first React/TypeScript. Keep it strict, teachable, and boring in the right places.

## Required Verification

- `make check`
- `make lint`
- `make types`

Use `make lint:fix` locally when you want Rust formatting plus Biome fixes.

## Auth Baseline

- Admin and user portals both use token auth in this starter.
- Frontend auth should go through `createAuth({ mode: "token", ... })`.
- Refresh uses Forge's shared `RefreshTokenRequest` DTO.
- WebSocket token exchange uses Forge's shared `WsTokenResponse` DTO.

## Rust Baseline

- Prefer `#[derive(Validate)]` with `forge::ApiSchema` and `ts_rs::TS` for simple request DTOs.
- Use `JsonValidated<T>` for JSON-only request extraction in handlers.
- Keep manual `RequestValidator` only for runtime-driven, conditional, or semantic validation that cannot be expressed declaratively.
- Replace raw string fields with typed enums when the enum already exists.
- Prefer Forge-shared DTOs when they already exist, such as `RefreshTokenRequest`, `MessageResponse`, `TokenPair`, and `WsTokenResponse`.
- Return typed success DTOs such as `MessageResponse`, `WsTokenResponse`, and `StatusResponse` instead of inline JSON objects.
- User-facing backend messages must come from translation keys, not raw strings.

## Frontend Baseline

- Treat `frontend/shared` as the public system layer.
- Feature/module code must use shared primitives and hooks.
- Raw native controls are acceptable only inside shared infrastructure components.
- If a feature needs existing portal-specific button styling, use `<Button unstyled ...>` instead of raw `<button>`.
- Form state should mirror generated backend DTOs closely, including enums and numeric fields.
- Datatable metadata and filter/sort shapes should come from generated Forge types, not handwritten `any`-based mirrors.

## Tooling And Auto Feedback

- `.vscode/settings.json` configures Biome formatting, rustfmt, and rust-analyzer clippy checks on save.
- `.claude/settings.json` runs the repo formatter hook after Claude Code file edits.
- `opencode.json` configures Rust and React/TypeScript formatters for OpenCode.
- `.codex/config.toml` currently provides project-doc fallback for Codex. This starter does not have a Codex-specific formatter hook configured yet.

## Docs To Keep In Sync

- `STARTER-BASELINE.md`
- `CLAUDE.md`
- `frontend/CLAUDE.md`
- `src/portals/CLAUDE.md`
- `NEW-PORTAL.md`

## Forge Follow-Ups

Forward framework-level cleanup items from [FORGE-FOLLOW-UPS.md](FORGE-FOLLOW-UPS.md).
