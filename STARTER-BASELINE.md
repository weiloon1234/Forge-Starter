# Consistency Baseline

Baseline conventions for Forge-first Rust and system-first React/TypeScript. Keep it strict and consistent.

## Required Verification

- `make check`
- `make lint`
- `make types`

Use `make lint:fix` locally when you want Rust formatting plus Biome fixes.

## Auth Baseline

- Admin and user portals both use token auth.
- Frontend auth should go through `createAuth({ mode: "token", ... })`.
- Refresh uses Forge's shared `RefreshTokenRequest` DTO.
- WebSocket token exchange uses Forge's shared `WsTokenResponse` DTO.
- Forge observability stays enabled at `/_forge/*`, but is locked to authenticated developer admins only by default.
- WebSocket observability payloads stay redacted by default via `observability.websocket.include_payloads = false`.
- If a project wants broader observability access, relax the authorizer intentionally in `src/bootstrap/http.rs`.

## Rust Baseline

- Prefer `#[derive(Validate)]` with `forge::ApiSchema` and `ts_rs::TS` for simple request DTOs.
- Use `JsonValidated<T>` for JSON-only request extraction in handlers.
- Keep manual `RequestValidator` only for runtime-driven, conditional, or semantic validation that cannot be expressed declaratively.
- Replace raw string fields with typed enums when the enum already exists.
- Put app-owned shared enums in `src/domain/enums/` when they cross boundaries in this app, such as DB-backed model fields, services, request/response DTOs, or generated frontend types.
- Keep Forge-owned enums imported from Forge directly instead of wrapping or duplicating them locally.
- Keep file-private helper enums local to the module that uses them.
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

## I18n Baseline

- `locales/<locale>/*.json` in the project root is the shared translation source for Rust and React. Do not create separate frontend-only locale files.
- The backend loads from `config/i18n.toml` with `resource_path = "locales"`, and both portals load that same tree in `main.tsx`.
- English is both the fallback and the key. If the key and display text are the same, skip the English entry entirely.
- Add English entries only when the display text differs from the key or when the string is parameterized, such as `"greeting": "Hello, {{name}}!"`.
- Non-English locale files must stay complete for every key that code uses.

## Tooling And Auto Feedback

- `.vscode/settings.json` configures Biome formatting, rustfmt, and rust-analyzer clippy checks on save.
- `.claude/settings.json` runs the repo formatter hook after Claude Code file edits.
- `opencode.json` configures Rust and React/TypeScript formatters for OpenCode.
- `.codex/config.toml` currently provides project-doc fallback for Codex. A Codex-specific formatter hook is not configured yet.

## Docs To Keep In Sync

- `STARTER-BASELINE.md`
- `CLAUDE.md`
- `frontend/CLAUDE.md`
- `src/portals/CLAUDE.md`
- `NEW-PORTAL.md`

## Forge Follow-Ups

Forward framework-level cleanup items from [docs/forge-internals/FORGE-FOLLOW-UPS.md](docs/forge-internals/FORGE-FOLLOW-UPS.md).
