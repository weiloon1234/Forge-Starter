## What This Is

A Forge framework multi-portal Rust backend with React frontends. Single binary, 4 runtime processes (HTTP, Worker, Scheduler, WebSocket). Forge handles infrastructure; app code stays in `src/domain/` and `src/portals/`.

## Skills

Project-level skills under `.claude/skills/` codify recurring development patterns with strongly-typed discipline and a consistent shape. Each skill is a `SKILL.md` with a frontmatter `description` that triggers on relevant user phrasings — future LLM sessions discover and apply them automatically. Conventions for writing / reading / extending skills live in `.claude/skills/SKILL-CONVENTIONS.md` (tier model + shared section layout + naming + strongly-typed rules).

**Orchestrator (Tier 3):**

| Skill | Use when |
|---|---|
| [`new-module`](.claude/skills/new-module/SKILL.md) | Adding a whole new feature module that spans model + permissions + admin UI + routes + optional badge/events/jobs/notifications — sequences invocations of the smaller skills in dependency order |
| [`new-portal`](.claude/skills/new-portal/SKILL.md) | Adding a full new authenticated portal (routes + SPA + guards + permissions) |

**Backend skills:**

| Skill | Use when |
|---|---|
| [`new-model`](.claude/skills/new-model/SKILL.md) | Adding a new `forge::Model` — struct, migration, seeder, relations, authenticatable wiring |
| [`new-enum`](.claude/skills/new-enum/SKILL.md) | Adding a `#[derive(forge::AppEnum)]` enum — shared under `src/domain/enums/` or file-private helper |
| [`new-permission`](.claude/skills/new-permission/SKILL.md) | Adding a `Permission` enum variant for a new RBAC scope |
| [`new-route`](.claude/skills/new-route/SKILL.md) | Adding a single REST route OR frontend SPA route that isn't covered by a broader feature skill (custom actions, webhooks, health, bulk, export) |
| [`new-event-listener`](.claude/skills/new-event-listener/SKILL.md) | Reacting to a domain event or `ModelCreated/Updated/Deleted` bus event |
| [`new-schedule`](.claude/skills/new-schedule/SKILL.md) | Adding a recurring / cron-driven task in `src/schedules/` (hourly cleanup, daily reports, etc.) |
| [`new-validation-rule`](.claude/skills/new-validation-rule/SKILL.md) | Adding a custom `ValidationRule` — field-level server-side checks beyond built-ins |
| [`new-channel`](.claude/skills/new-channel/SKILL.md) | Adding a custom WebSocket channel beyond `admin:presence` / `admin:badges` |
| [`new-cli-command`](.claude/skills/new-cli-command/SKILL.md) | Adding a custom CLI command (`PROCESS=cli cargo run -- <your:command>`) — import / backfill / cleanup / ops scripts |
| [`new-integration`](.claude/skills/new-integration/SKILL.md) | Wrapping a third-party API (Stripe / Twilio / KYC / etc.) under `src/domain/integrations/` |

**Frontend skills:**

| Skill | Use when |
|---|---|
| [`shared-components`](.claude/skills/shared-components/SKILL.md) | Picking the right `@shared/components` primitive, composing a control / modal / store — the anti-raw-HTML catalog |
| [`frontend-form`](.claude/skills/frontend-form/SKILL.md) | Building a form — modal, page, wizard, settings — using `useForm` + `@shared/components` |
| [`new-store`](.claude/skills/new-store/SKILL.md) | Adding a frontend shared-state store via `createStore` — imperative API + selector hooks |
| [`admin-page`](.claude/skills/admin-page/SKILL.md) | Admin-portal page that is NOT a CRUD list (dashboard, detail, workflow, settings, report, viewer) |
| [`admin-datatable`](.claude/skills/admin-datatable/SKILL.md) | Admin list / CRUD page backed by the datatable system |
| [`admin-badge`](.claude/skills/admin-badge/SKILL.md) | Work-queue count indicator on the admin sidebar |

**Cross-cutting skills:**

| Skill | Use when |
|---|---|
| [`middleware`](.claude/skills/middleware/SKILL.md) | Choosing / configuring HTTP middleware (CORS, CSRF, RateLimit, Compression, MaxBodySize, RequestTimeout, ETag, SecurityHeaders) — global, named groups, per-scope, per-route overrides |
| [`jobs-and-notifications`](.claude/skills/jobs-and-notifications/SKILL.md) | Async background work (Forge Jobs with retry/backoff/rate-limit) OR multi-channel user-facing delivery (Forge Notifications — email / database inbox / WebSocket broadcast) |
| [`testing`](.claude/skills/testing/SKILL.md) | Writing backend tests — inline unit tests in service modules, or end-to-end integration tests under `tests/<scenario>.rs` that boot the HTTP kernel + real Postgres and hit endpoints with real auth tokens |
| [`typescript`](.claude/skills/typescript/SKILL.md) | Understanding / extending the Rust → TypeScript generation pipeline |

**Skill composition** — bigger skills delegate to smaller ones. `new-module` is the Tier-3 orchestrator that sequences the others for a whole-feature slice. `new-portal` invokes `new-model` (for the auth actor) and `new-permission` (per RBAC variant). `admin-datatable` assumes the model exists via `new-model`, and delegates its form-modal template to `frontend-form`. `admin-page` and `admin-datatable` both consult `shared-components` for primitive picks. `admin-badge` assumes the model + its lifecycle events exist. `new-route` picks up the gap when a single REST / SPA route doesn't fit a broader feature skill. Skills stack rather than overlap — the canonical shape for each layer lives in exactly one skill.

## Baseline

- Admin and user portals both use token auth.
- Required verification commands: `make check`, `make lint`, `make types`.
- Simple JSON DTOs should prefer `#[derive(Validate)]` + `forge::ApiSchema`; runtime-driven or conditional rules can stay manual.
- JSON-only handlers should use `JsonValidated<T>`.
- Feature/module frontend code must use shared primitives. If a portal-specific button style already exists, use `Button unstyled` rather than raw `<button>`. Full catalog + rules: `frontend/CLAUDE.md` ("Rules" + "Component Map"), or the `shared-components` skill for the triggering-aware reference.
- Two directory-scoped `CLAUDE.md` files sit below the root — Claude Code auto-loads each when an agent operates in that directory. Keep them consistent with the root: `frontend/CLAUDE.md` (frontend-specific rules + SSOT Rust→TS + i18n) and `src/portals/CLAUDE.md` (portal-local route scope DSL + naming conventions + thin-handler rule). Each points back at skills for procedures.
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

**CLI scaffolders — always use these; never hand-create the files they generate:**

```bash
PROCESS=cli cargo run -- make:model     --name <PascalName>    # src/domain/models/<snake>.rs
PROCESS=cli cargo run -- make:migration --name <slug>          # database/migrations/{timestamp}_<slug>.rs
PROCESS=cli cargo run -- make:seeder    --name <Name>          # database/seeders/{prefix}_<snake>.rs
PROCESS=cli cargo run -- make:job       --name <PascalName>    # src/domain/jobs/<snake>.rs
PROCESS=cli cargo run -- make:command   --name <PascalName>    # src/commands/<snake>.rs
```

Files under `database/migrations/` and `database/seeders/` whose prefix is `000000000001_` through `000000000011_` are **Forge-published baselines** (schema foundation: personal_access_tokens, notifications, metadata, attachments, model_translations, countries, settings, users, admins) written into the project by `migrate:publish` / `seed:publish`. Don't hand-edit them, don't mimic their numeric-prefix naming — your app migrations / seeders always come from the scaffolders above.

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

For every recurring task, the authoritative procedure is the matching skill in `.claude/skills/`. The Skills table above indexes all 21; the five summaries below preview the shape of the biggest cross-cutting patterns without leaving CLAUDE.md. Narrower tasks — event listener, permission, schedule, channel, validation rule, CLI command, integration, enum, store, route, form, admin page, middleware, TypeScript pipeline, shared-component selection — each have their own skill; consult the table.

**Adding a whole feature module** (Tier-3 orchestration) — sequenced invocation of `new-permission` + `new-model` + `admin-datatable` + optional `admin-badge` + optional `new-event-listener` + optional `jobs-and-notifications`, in dependency order. → skill `new-module`.

**Adding a new portal** — auth actor + route scope + `src/portals/<name>/` + `src/portals/spa.rs` handler + `frontend/<name>/` SPA + Makefile + Dockerfile. → skill `new-portal`.

**Adding a new model** — `#[derive(Serialize, forge::Model)]` + `#[forge(model = "<table>")]` + CLI-scaffolded migration + `mod.rs` export. Authenticatable actors additionally need `impl HasToken + Authenticatable` + `Guard::<Name>` + `config/auth.toml` block + `register_authenticatable::<M>()?` call. → skill `new-model`.

**Adding an admin CRUD page** — Datatable trait + routes + request/response DTOs + service + form modal + delete modal + menu + i18n. Form-modal shape delegates to `frontend-form`. → skill `admin-datatable`.

**Adding a sidebar count badge** — `impl AdminBadge` with `KEY` / `PERMISSION` / `type Watches` / `count()` + one-line provider registration + `badge: "work.<key>"` on the menu item. → skill `admin-badge`.

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

**Adding a new channel** → skill `new-channel` (covers decisions: public vs guarded, presence tracking, broadcast-only vs bidirectional, per-user rooms).

## Admin Badge System

Work-queue count indicators on the admin sidebar — each badge answers "how many items need admin action?" (pending top-ups, pending KYC, etc.). Distinct from `forge::Notification` (outbound message delivery).

**Architecture in one sentence:** Forge's `ModelCreated/Updated/DeletedEvent` bus → `BadgeLifecycleListener` → debounced `BadgeDispatcher` → `app.websocket()?.publish("admin:badges", ...)` → admin frontend filters deltas by the REST snapshot allowlist returned from `GET /api/v1/admin/badges`.

**Adding a badge** → skill `admin-badge` (full checklist + strongly-typed templates + do-nots).

**Key conventions:**
- Keys are namespaced `work.*` for pending-action queues. Reserved for future `inbox.*` / `alert.*`.
- Parents auto-sum visible children's counts (sidebar helper `getBadgeCount`).
- Dev-only smoke badge `DevDummyBadge` gated behind `APP__BADGES__DEV_DUMMY=true` — leave off in production.

## Custom Validation Rules

Custom rules (impls in `src/validation/rules.rs`, IDs in `src/ids/validation.rs`, registered in `src/bootstrap/app.rs`) extend Forge's built-in validators for field-level checks the built-ins don't cover — e.g. `MobileRule`, `UsernameRule`, `PasswordRule`, `ActiveCountryRule` already ship with the starter. Error codes map to `validation.{code}` keys in `locales/*/validation.json` (same convention as built-in rules). Request DTOs invoke custom rules via `.rule(ids::validation::MY_RULE)` on the field chain.

**Adding a new rule** → skill `new-validation-rule`.

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
10. **Key style: English-as-key is the STRONG default for UI text.** Every static user-facing string uses the English display text verbatim as the key. Skip the English `en.json` entry (key == value → i18next falls back to the key). Only add entries for non-English locales.

    ```tsx
    // Buttons, titles, toasts, column headers, placeholders, aria labels
    t("New User")              // button
    t("Create User")           // modal title
    t("Edit user")             // aria label / tooltip (sentence case)
    t("User created")          // success toast
    t("Username")              // column header / form label
    t("Leave blank to keep the current password")   // placeholder
    ```

    Native keys are **reusable across features by default** — `t("Created")` / `t("Name")` / `t("Email")` work on every page that needs them. Adding a feature-namespaced `admin.users.columns.created` duplicates translation work that any other table already did.

11. **NEVER feature-namespace static UI text.** The pattern `admin.<feature>.<thing>` for buttons / titles / toasts / column headers / placeholders / aria labels is an anti-pattern — it forces every new feature to re-translate the same generic phrases.

    ```tsx
    // ❌ DO NOT — feature-scoped keys for generic UI text
    t("admin.users.new")              // re-adds "New User" per feature
    t("admin.users.create_title")     // re-adds "Create User" per feature
    t("admin.users.created")          // re-adds "User created" per feature
    t("admin.users.new_password")     // re-adds "New password" per feature

    // ✅ DO — flat English-as-key, shared across the whole app
    t("New User")
    t("Create User")
    t("User created")
    t("New password")
    ```

    **Existing code like `admin.admins.*` / `admin.credits.*` / `admin.pages.*` is LEGACY, not a model to imitate.** When adding new features, use English-as-key even if siblings use the namespaced style. Do not port those legacy keys as part of unrelated work — but do not grow them either.

12. **Namespaced keys are ONLY for these three structural cases:**

    - **AppEnum `labelKey` outputs** — `enum.admin_type.super_admin`, `enum.credit_type.credit_1`. Generated by `forge::AppEnum`, consumed by `enumLabel` / `enumOptions`. The key is a structural path, not user text.
    - **Validator field-name conventions** — `admin.credits.fields.user` referenced by `validator.custom_attribute("user_id", "admin.credits.fields.user")` so server-side validation errors render with a friendly field label.
    - **Domain-coded multi-context strings** — `admin.introducer_changes.errors.self_introducer` when a message is produced server-side and consumed in multiple UI places, AND has no natural English-as-key form.

    If the string is a button label, modal title, toast, column header, placeholder, or aria label, it is NOT one of these cases. Use English-as-key.

13. **Don't add translations you don't need.**

    - Short modal subtitles and help texts are usually decorative — prefer no subtitle over adding a translated one. Every translated string is future maintenance.
    - Before adding a new key, grep `locales/zh/messages.json` for the English phrase. If it (or a close equivalent) already exists as an English-as-key, reuse it.
    - Two features that say "Create X" and "Edit X" should share `t("Create X")` / `t("Edit X")`, not each define their own `admin.<feature>.create_title`.

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
- Do not render raw native HTML form controls (`<button>`, `<input>`, `<select>`, `<textarea>`, `<form>` as event-target) in feature / page / module code — always use `@shared/components` primitives (`<Input>`, `<Select>`, `<Button>`, etc.). `<Button unstyled>` is the escape hatch for clickable-but-custom-styled cases. Only `frontend/shared/` infrastructure internals may touch native controls.
- Do not concatenate translations — use parameterized keys instead
- Do not return raw string error messages from backend — use `t!(i18n, "key")` for any API response text the user will see
- Do not hand-create model / migration / seeder / job / command files — use the CLI scaffolders (`make:model`, `make:migration`, `make:seeder`, `make:job`, `make:command`) from the Commands section above
- Do not hand-edit or mimic the `000000000001_*` baseline files in `database/migrations/` or `database/seeders/` — those are Forge-published foundations, not your template

## Important discipline of codebase

**DRY (Don't Repeat Yourself)** — if the same logic appears in two places, extract. Duplicate code drifts; drift produces bugs.

**SSOT (Single Source of Truth)** — every piece of knowledge has exactly one authoritative location. This is the non-negotiable backbone of the starter. Concrete applications:

- **Translations (i18n)** — `locales/<lang>/*.json` is the single source for BOTH Rust backend (`t!(i18n, "key")`) and React frontend (`t("key")`). Same files, same `{{variable}}` syntax, no separate frontend i18n copy. Non-English locales MUST contain every key the code references. See "Translation Rules" section for the full discipline.
- **Enums** — `src/domain/enums/<name>.rs` with `#[derive(forge::AppEnum)]` is the single source. The TypeScript union type + `Options` (with `labelKey`) + `Values` + `Meta` exports are generated by `make types` — never hand-written in TS. File-private helper enums stay inline in their model's file; enums referenced across modules live in `src/domain/enums/`.
- **Permissions** — `src/ids/permissions.rs` is the single source. Route `.permission(...)` guards, datatable `minimum_read_permission` mappings, admin badge `PERMISSION` consts, and frontend `usePermission` / `PermissionValues` all resolve back to the same enum variants with the same `#[forge(key = "...")]` wire keys.
- **Typed IDs** — `src/ids/` holds one file per concept (guards, permissions, jobs, schedules, channels, validation). Every inline string ID in app code is a bug; use the typed const.
- **Model columns** — `#[derive(forge::Model)]` generates compile-time column constants (`User::EMAIL`, `TopUp::STATUS`). Queries, seeders, `.set(...)` / `.where_eq(...)` always use these constants, never raw string names.
- **DTOs — one struct, four roles.** Each Rust DTO in `src/portals/<portal>/{requests,responses}.rs` serves four purposes from a single declaration: (1) **validation surface** — `#[derive(Validate)]` or `impl RequestValidator` runs server-side; (2) **wire contract** — `serde::Deserialize/Serialize` + `forge::ApiSchema` for the HTTP payload + OpenAPI schema; (3) **TypeScript type** — `ts_rs::TS` + `#[ts(export)]` → `frontend/shared/types/generated/`; (4) **React form's value type** — `useForm<CreateFooRequest>` binds directly to the generated type, so `values` IS a `CreateFooRequest`. Never hand-write a parallel TS Request type; never reimplement validation client-side; never define a local `FormValues` interface when the Request type already matches 1:1. Deviations (local `FormValues` type) are justified only when the form carries UI-only state the DTO can't represent: password + confirmation, search queries feeding async Select options, unified create-or-edit modals where Create/Update DTOs have different shapes.
- **Scoped queries** — if the same `.where_eq(Self::FIELD, value)` filter appears in more than one call site, promote it to a method on the model (`impl <Model> { pub fn <scope>() -> ModelQuery<Self> { ... } }`). The filter's definition lives on the model, not duplicated across services.
- **Routes** — each route is declared once in its portal's `src/portals/<portal>/mod.rs` scope. Frontend consumers use the typed response/request DTOs; no hand-coded URL strings with hand-coded payload shapes.
- **Badge count logic** — one `AdminBadge::count()` implementation drives both the REST snapshot (`GET /admin/badges`) and the WebSocket push path. No parallel "count for the API" vs "count for the WS" forks.
- **Skills** — the canonical procedure for each recurring task lives in exactly one `.claude/skills/<name>/SKILL.md`. Quick references in this file point at skills; they never duplicate the full procedure.

Violating SSOT produces drift. Drift produces bugs and onboarding friction. The skills in `.claude/skills/` exist to enforce SSOT at the procedural level — pinning each recurring task to one canonical shape so that adding a badge, a model, or a portal never re-invents the file structure.
