## What This Is

A Forge framework multi-portal Rust backend with React frontends. Single binary, 4 runtime processes (HTTP, Worker, Scheduler, WebSocket). Forge handles infrastructure; app code stays in `src/domain/` and `src/portals/`.

## Baseline

Read `STARTER-BASELINE.md` first before making structural changes.

- Admin and user portals both use token auth.
- Required verification commands: `make check`, `make lint`, `make types`.
- Simple JSON DTOs should prefer `#[derive(Validate)]` + `forge::ApiSchema`; runtime-driven or conditional rules can stay manual.
- JSON-only handlers should use `JsonValidated<T>`.
- Feature/module frontend code must use shared primitives. If a portal-specific button style already exists, use `Button unstyled` rather than raw `<button>`.
- Observability is enabled by default, but `/_forge/*` is intentionally locked to authenticated developer admins only in `src/bootstrap/http.rs`.
- WebSocket observability payloads stay redacted by default via `config/observability.toml`.
- If a project wants broader observability access, it must intentionally relax the bootstrap authorizer.

## Commands

```bash
make setup        # First-time: generate keys, publish migrations, run migrations
make dev          # Start backend + websocket + scheduler + both frontends
make dev:api      # Backend API only (:3000)
make dev:admin    # Admin frontend only (:5173)
make dev:user     # User frontend only (:5174)
make check        # cargo check (fast type-check)
make lint         # Rust + frontend lint checks
make lint:fix     # rustfmt + Biome auto-fix
make build        # Build release binary + both frontends
make api-docs     # Generate docs/api/ (LLM-friendly API reference)
make types        # Generate TypeScript types from Rust DTOs
make migrate      # cargo run -- db:migrate
make seed         # cargo run -- db:seed
make routes       # cargo run -- routes:list
make deploy       # bash scripts/build.sh (Docker build + R2 upload)
```

## Config + .env Override

Config files in `config/*.toml` hold **development defaults** (safe to commit). Production overrides via `.env` using double-underscore notation:

```
config/database.toml:  [database] url = "postgres://..."
.env override:         DATABASE__URL=postgres://production:...

config/app.toml:       [app] signing_key = "dev-key"
.env override:         APP__SIGNING_KEY=production-key

config/crypt:          [crypt] key = "dev-key"
.env override:         CRYPT__KEY=production-key
```

Every TOML config value is overridable. Nested: `AUTH__TOKENS__ACCESS_TOKEN_TTL_MINUTES=30`.

## Project Structure

```
src/
├── main.rs                  # PROCESS env switch → kernel
├── lib.rs                   # Module declarations
├── bootstrap/               # AppBuilder per kernel (http, cli, scheduler, worker, websocket)
├── ids/                     # Typed ID constants (guards, permissions, jobs, schedules, channels)
├── providers/               # ServiceProvider — DI registration (auth, jobs, events)
├── portals/                 # HTTP routes — THIN handlers only (~5 lines each)
│   ├── admin/               # Token auth: /api/v1/admin/*
│   └── user/                # Token auth: /api/v1/user/*
├── domain/
│   ├── models/              # #[derive(forge::Model)] + Authenticatable
│   ├── services/            # Business logic lives HERE (portal-less)
│   ├── jobs/                # Background jobs (impl Job)
│   ├── events/              # Domain events + listeners/
│   ├── enums/               # Shared app-owned enums used across model/service/DTO/frontend boundaries
│   └── integrations/        # Third-party API wrappers
├── commands/                # CLI commands
├── schedules/               # Cron/interval tasks
├── realtime/                # WebSocket channels
├── types/                   # App-level shared response DTOs (StatusResponse, ApiError, FieldError)
└── validation/              # Custom validation rules
```

## Architecture Rules

1. **Portals are THIN** — extract request, validate, call service, return response. No business logic in route handlers.
2. **Services are portal-less** — `domain/services/` contains all orchestration. Both admin and user portals call the same service functions.
3. **Portal validates shape, service validates meaning, model enforces truth.**
4. **One rule for IDs** — every framework concept has a typed ID in `src/ids/`. Add new IDs there, not inline.
5. **Binary name is `app`** — never rename `Cargo.toml`. App identity comes from `.env` / `config/app.toml`.
6. **One rule for enums** — app-owned shared enums live in `src/domain/enums/`; Forge-owned enums stay imported from Forge; file-private helper enums stay local to their module.

## Key Patterns

**Adding a new portal** (e.g., merchant):
1. `src/portals/merchant/` — mod.rs, routes, requests.rs, resources.rs
2. `src/ids/guards.rs` — add `Guard::Merchant`
3. `src/ids/permissions.rs` — add merchant permissions
4. `config/auth.toml` — add `[auth.guards.merchant]`
5. `src/domain/models/merchant.rs` — Model + Authenticatable
6. `frontend/merchant/` — Vite React SPA

**Adding a new model:**
1. `src/domain/models/` — `#[derive(Serialize, forge::Model)]` with `#[forge(model = "table_name")]`
2. `database/migrations/` — create migration file
3. Register in `providers/app_service_provider.rs` if authenticatable

**Adding a new job:**
1. `src/domain/jobs/` — impl `Job` trait
2. `src/ids/jobs.rs` — add `JobId` constant
3. Register: `registrar.register_job::<MyJob>()` in provider

**Adding a new event:**
1. `src/domain/events/` — impl `Event` trait
2. `src/domain/events/listeners/` — impl `EventListener`
3. Register: `registrar.listen_event::<E, _>(Listener)` in event provider

## Runtime Config (SPA Bootstrap)

The SPA handler (`src/portals/spa.rs`) injects `window.__APP_CONFIG__` into the HTML served to browsers. Available synchronously before React mounts — no API call needed.

**Backend** — `runtime_bootstrap_service` builds JSON from `AppContext` and `spa.rs` injects it:
```rust
// Fields: app_url, ws_url, locales, default_locale, settings, countries
// Extend here when adding new runtime config
runtime_bootstrap_service::load(app).await?
```

**Frontend** — typed accessor and shared store live at `@shared/config`:
```ts
import { getConfig, runtimeStore } from "@shared/config";
const config = getConfig();
runtimeStore.hydrate(config);
```

To add new config: extend `RuntimeBootstrap` in `src/domain/services/runtime_bootstrap_service.rs` + `AppConfig` in `frontend/shared/config/index.ts`.

## WebSocket

WebSocket runs as a separate process on port 3010 (`PROCESS=websocket cargo run`). Config in `config/websocket.toml`.

**Channels** are registered in `src/realtime/mod.rs`. Channel IDs in `src/ids/channels.rs`.

**Auth**: Browser WebSocket API can't set headers. Token is passed via query param: `ws://host:3010/ws?token=xxx`. The framework extracts it automatically.

**Token exchange**: Authenticated portals call `POST /auth/ws-token` to get a short-lived PAT for the WebSocket connection.

**Frontend client** at `@shared/websocket`:
```ts
import { createWebSocket } from "@shared/websocket";

const ws = createWebSocket({
  url: config.ws_url,
  getToken: async () => { /* fetch ws-token from API */ },
});

ws.connect();
ws.subscribe("admin:presence");
ws.on("admin:presence", "presence:join", (payload) => { ... });
ws.useStatus(); // "connected" | "connecting" | "disconnected"
```

**Adding a new channel:**
1. `src/ids/channels.rs` — add `ChannelId` constant
2. `src/realtime/mod.rs` — register with `registrar.channel_with_options(...)`
3. Frontend — `ws.subscribe("channel-name")` + `ws.on(...)` listeners

## Custom Validation Rules

Custom rules are registered in `src/bootstrap/app.rs`. Rule IDs in `src/ids/validation.rs`. Rules in `src/validation/rules.rs`.

**Adding a new rule:**
1. `src/validation/rules.rs` — struct implementing `ValidationRule` trait
2. `src/ids/validation.rs` — add `ValidationRuleId` constant
3. `src/validation/mod.rs` — export the struct
4. `src/bootstrap/app.rs` — `.register_validation_rule(id, Rule)`
5. `locales/*/validation.json` — add `validation.{code}` translation keys
6. Usage: `.rule(ids::validation::MY_RULE)` in request validators

Error codes from custom rules are translated via `validation.{code}` in locale files (same as built-in rules).

## Forge Framework API

Run `make api-docs` to generate `docs/api/` — 31 modules of structured API reference. Load only the module you need:
- `docs/api/modules/database.md` — models, queries, relations
- `docs/api/modules/auth.md` — guards, tokens, sessions, policies
- `docs/api/modules/http.md` — routes, middleware, resources
- `docs/api/modules/validation.md` — 38+ rules
- `docs/api/modules/jobs.md` — background processing
- `docs/api/index.md` — full module index

## Deployment

See `DEPLOY.md` for the complete deployment guide. Key files:
- `scripts/setup.sh` — server provisioning (PostgreSQL, Redis, Nginx, SSL, systemd)
- `scripts/build.sh` — Docker build + R2 upload
- `scripts/deploy-poll.sh` — server-side auto-deploy daemon
- `config/storage.toml` — R2 bucket config (shared for storage + deployments)

## Translation Rules

Translation files in `locales/` are shared between Rust backend and React frontend. **Same files, same `{{variable}}` syntax.**

**English is the fallback AND the key.** Rules:

1. **Do NOT translate English when key = value.** `"Hello": "Hello"` is pointless — skip it. The key itself is returned as fallback.
2. **DO translate English when key ≠ display text.** `"Credit 1": "Cash Point"` — the key is a code, the value is what the user sees. Write this in `en.json`.
3. **DO write English when parameterized.** `"greeting": "Hello, {{name}}!"` — always write parameterized translations in English because the key alone is not readable.
4. **Every other locale MUST have every key.** If `zh.json` is missing a key that `en.json` or code uses, that is a bug. All non-English locale files must be complete — equal row count, every key present.
5. **Every user-facing text MUST be translated.** If the user will see it on screen, use `t("key")`. No raw strings in UI — labels, placeholders, buttons, errors, toasts, messages.
6. **NEVER concatenate translated text.** Do NOT write `` `Special ${t("offer")}` `` — instead write `t("special_offer")` with the full sentence as one key. Concatenation breaks word order in other languages.
7. **Always parameterize.** Write `t("welcome_user", { name })` not `` `${t("welcome")} ${name}` ``. Parameters go inside `{{}}` in the JSON.
8. **Group parameterized translations together** in the JSON file. Keep related keys in nearby lines for context.
9. **Backend error messages MUST use translation keys.** Any `Error::http(...)`, `Error::not_found(...)`, validation message, or API response text that the user will see must use `t!(i18n, "key")`, not a raw English string. The frontend displays these in toasts and error UI — they must be translatable.
10. **Key style: English-as-key is the default.** Static user-facing strings use the English display text itself as the key: `t("Save")`, `t("Password changed")`, `t("Welcome")`. Skip the English entry when key == display (see rules 1–2); non-English locales translate to the actual word. Namespaced keys (`admin.credits.fields.user`, `enums.AdminType.Developer`) are reserved for **convention-driven translations** — field labels referenced by AppEnum validators, enum variant display names, and other programmatically-generated keys where the key is a structural path, not user-visible text. Coded keys (`"greeting": "Hello, {{name}}!"`) are for parameterized strings where the key alone is not readable.

**Example:**
```json
// locales/en/messages.json — only keys that need values
{
    "greeting": "Hello, {{name}}!",
    "item_count": "You have {{count}} items",
    "credit_label": "Cash Point"
}
// "Save", "Cancel", "Delete" — skip in English (key = value fallback)

// locales/zh/messages.json — MUST have every key
{
    "greeting": "你好，{{name}}！",
    "item_count": "你有 {{count}} 个项目",
    "credit_label": "现金点数",
    "Save": "保存",
    "Cancel": "取消",
    "Delete": "删除"
}
```

## Do NOT

- Do not rename `Cargo.toml` package name or `[[bin]]` name
- Do not put business logic in portal route handlers
- Do not hardcode string IDs — use typed constants from `src/ids/`
- Do not install new dependencies without asking
- Do not modify `scripts/systemd/` static files — setup.sh generates services dynamically
- Do not write raw user-facing strings — always use `t("key")` for any text the user sees
- Do not concatenate translations — use parameterized keys instead
- Do not return raw string error messages from backend — use `t!(i18n, "key")` for any API response text the user will see

## Important discipline of codebase

- DRY (Don't Repeat Yourself) is very important
- SSOT (Single Source Of Truth) is very important
