---
name: new-portal
description: Use when adding an entirely new portal to the starter — a new authenticated surface with its own login, REST routes, optional SPA frontend, guard, and permission scope. Typical phrasings: "add a merchant portal", "new portal for partners", "add a vendor login", "third portal for resellers". Covers the complete cross-subsystem orchestration: new auth-actor model (delegates to new-model), Guard enum + auth.toml, `src/portals/<name>/` route scope, `src/portals/spa.rs` handler, frontend scaffold under `frontend/<name>/` (copied from admin or user), router + menu + i18n, Makefile dev target, Dockerfile build stages, Biome/tsconfig includes, .gitignore entries, portal-specific permissions (delegates to new-permission). Do NOT use for: adding a page/feature to an existing portal (regular work); adding an API-only endpoint to an existing portal (route + DTO in that portal's module); replacing admin/user portal's auth mechanism (larger refactor — escalate); white-label / multi-tenant variants of an existing portal (requires auth.toml + middleware design work — escalate).
---

# New Portal — add a new authenticated portal to the starter

## When to invoke

A developer needs a new authenticated surface with its own login actor and REST/frontend boundary. Typical phrasings:

- "add a merchant portal so merchants can log in and see their orders"
- "new portal for partners with their own dashboard"
- "vendor login — minimal API-only, no frontend"
- "third portal for resellers — separate guard, separate permissions"

Do NOT invoke for:
- **Adding a page / feature to an existing portal** — regular feature work inside `src/portals/admin/` or `src/portals/user/` + `frontend/admin` or `frontend/user`. Use `admin-datatable`, `admin-badge`, or plain route authoring instead.
- **Adding an unauthenticated API-only endpoint** to an existing portal — just add the route with `.public()` on the scope. No skill needed.
- **Replacing an existing portal's auth mechanism** (e.g., switching admin from token to session) — structural change; escalate.
- **Multi-tenant variants** (e.g., "each merchant has their own sub-portal") — auth.toml + middleware + DB-level tenant scoping is a larger design. Escalate before applying this skill.

## Concept

A "portal" in this starter is a triple of:

1. **An authenticatable login actor model** (e.g., `Admin`, `User`; you'll create `<YourPortal>`) that `impl Authenticatable + HasToken`.
2. **A routes scope** (`src/portals/<name>/mod.rs`) mounted under `/api/v1/<name>/` with its own auth routes, business routes, request/response DTOs, and `Guard::<Portal>` gating.
3. **(Optional) An SPA frontend** — a Vite+React+Tailwind app under `frontend/<name>/` served at a portal-specific base path (e.g., `/<name>/`), with its own `api.ts`, `auth.ts`, `router.tsx`, and full route tree. API-only portals skip this.

The HTTP kernel, middleware stack, database, job queue, WebSocket broker, and observability dashboard are **shared** across portals — no per-portal duplication of infrastructure. What's per-portal is the trio above plus a handful of config / build-tool hookups.

**Deeper references**:
- Existing portals to mirror: `src/portals/admin/` (feature-rich, permissioned) and `src/portals/user/` (minimal).
- Frontend references: `frontend/admin/` and `frontend/user/`.

## Prerequisites

- [ ] **Portal name decided.** Singular lowercase snake_case. Will become a module name, a guard name, a route prefix, and a frontend directory name. Examples: `merchant`, `partner`, `vendor`, `reseller`. Avoid `api`, `auth`, `public`, or anything that clashes with existing scopes.
- [ ] **Auth actor model decided.** Either you're creating a new model (`Merchant`, `Partner`) — typical — or you're binding an existing model to a second guard (uncommon; requires multiple `impl Authenticatable` which Rust forbids on the same type). Default: new model.
- [ ] **Vite dev port reserved.** Admin = 5173, User = 5174. Next = **5175**. Must match between `frontend/<name>/vite.config.ts` (`server.port`) and `src/portals/spa.rs` (`VITE_<NAME>_PORT` constant).
- [ ] **Frontend deps decided.** Admin portal includes Froala editor, Font Awesome — heavier. User portal is minimal. Pick the closer template: for a content-editing portal, copy admin; for a consumer-facing portal, copy user.

## Decisions — answer ALL before writing code (Tier 3 mandatory gate)

Cross-subsystem scope means the decision cascade is large. Walk the user through each axis. No code before all answers are confirmed.

### 1. Portal name and identity
- **Name**: `<name>` (singular, snake_case). Everything derives from this.
- **URL prefix** (REST): `/api/v1/<name>/`
- **URL prefix** (frontend): `/<name>/` (or `/` if this portal is at the root — only one portal can claim root; the current User portal does).
- **Display name**: "<Name> Portal" for HTML titles and i18n.

### 2. Auth actor
- **New model** (default) — invoke the `new-model` skill for the full trace of adding `<YourActor>` as a login actor. See `.claude/skills/new-model/examples/authenticatable-model.md` for the 7-file recipe.
- **Reuse existing** — only if the portal is a different surface for the same underlying actor (e.g., "admin portal + admin-mobile portal, same `Admin` model, different Guard"). Requires a second `Guard` variant pointing at the same model — currently unusual; consider carefully.
- **Actor table name** (plural snake_case): `<name>s`.
- **Password / auth secret field**: typical is `password_hash` with `#[forge(write_mutator = "hash_password")]`.
- **Soft-delete?** — usually yes for login actors (account recovery, audit).

### 3. Frontend shape
- **Full Vite+React+Tailwind SPA** (admin-style or user-style) — default for browser-facing portals.
- **API-only, no SPA** — skip all frontend steps; mobile app / third-party clients hit the REST routes directly. Still need the Rust backend portal.
- **Template source**: copy `frontend/user/` (leaner) or `frontend/admin/` (includes rich-text editor + icon set)?

### 4. Vite dev port
- `5173` taken (admin), `5174` taken (user). Default for a third portal: `5175`. Fourth: `5176`. Must be unique and match between `vite.config.ts` and `src/portals/spa.rs`.

### 5. Permissions
- **None** — the portal has no RBAC inside; being authenticated as the actor is sufficient (User-portal style).
- **Simple** — one or two permission variants (`<resource>.read`, `<resource>.manage`) — invoke the `new-permission` skill per variant.
- **Full RBAC** — actor has a `permissions: Vec<String>` column and an admin-style matrix. Model schema includes it; frontend has a permissions-management UI.

### 6. i18n namespace
- `<name>.*` key prefix for portal-specific translations. Seeded under `locales/en/messages.json` and `locales/zh/messages.json`.

### 7. Routes to ship in v1
- **Auth minimum** (always): `/auth/login`, `/auth/refresh`.
- **Admin-style additions**: `/auth/logout`, `/auth/me`, `/auth/ws-token` (WebSocket token exchange).
- **Domain routes**: at minimum a `/me` for the actor to fetch their own profile. List the other routes the v1 scope includes.

### 8. Observability access
- Is this portal allowed to see the Forge observability dashboard? Default **no** — only admins. If yes, extend the authorizer in `src/bootstrap/http.rs`.

### 9. Docker / deploy
- Does this portal ship to production? If yes, the Dockerfile gains build steps for the new frontend. If no (internal-only), leave Dockerfile alone.

Present all nine answers to the user. Confirm every one. THEN proceed.

## Orchestration — skills this one invokes

This is a Tier-3 skill. It does not do everything inline; it delegates:

- **`new-model`** — for the auth actor model. Follow `examples/authenticatable-model.md` in that skill. Returns with the model file, migration, Guard variant addition, auth.toml block, and `register_authenticatable::<T>()?` call done.
- **`new-permission`** — once per permission variant the portal introduces. Returns with the `Permission` enum updated and `make types` regenerated.
- **`typescript`** — implicit. The portal's request/response DTOs are exported via the normal `ts_rs::TS` + `forge::ApiSchema` pipeline. Reference the `typescript` skill if any DTO needs a non-obvious `#[ts(type = ...)]` override.

This skill's own steps are the glue: route scope wiring, SPA handler, frontend scaffolding, build config, Docker, and Makefile — the parts that are not domain work but are required to make the portal exist.

## File touches — full checklist

Reference for reviewers. Each item is either a "create" or a "modify". The later steps walk through each.

### Backend — create
- `src/portals/<name>/mod.rs` — portal route registration
- `src/portals/<name>/auth_routes.rs` — login/refresh (+ logout/me/ws-token if admin-style)
- `src/portals/<name>/requests.rs` — `<Name>LoginRequest`, etc.
- `src/portals/<name>/responses.rs` — `<Name>MeResponse`, etc. (only if admin-style)
- `src/domain/models/<name>.rs` — the auth actor (delegated to `new-model`)
- `database/migrations/{timestamp}_create_<name>s.rs` — actor table (delegated)

### Backend — modify
- `src/portals/mod.rs` — `pub mod <name>;` + `<name>::register(r)?;` in `register()`; SPA route + static assets in `register_spa()`
- `src/portals/spa.rs` — `VITE_<NAME>_PORT` const + `<NAME>_HTML` cache + `<name>_spa()` async fn
- `src/ids/guards.rs` — `Guard::<Name>` variant + match arm (delegated to `new-model`)
- `config/auth.toml` — `[auth.guards.<name>]` block (delegated)
- `src/providers/app_service_provider.rs` — `registrar.register_authenticatable::<<Name>>()?;` (delegated)
- `src/ids/permissions.rs` — variants if portal has RBAC (delegated to `new-permission`)
- `src/domain/services/auth_service.rs` — `<name>_login_with_token`, `refresh_<name>_token` functions

### Frontend — create (SPA portals only)
- `frontend/<name>/package.json`
- `frontend/<name>/tsconfig.json`
- `frontend/<name>/vite.config.ts`
- `frontend/<name>/index.html`
- `frontend/<name>/src/main.tsx`
- `frontend/<name>/src/App.tsx`
- `frontend/<name>/src/router.tsx`
- `frontend/<name>/src/api.ts`
- `frontend/<name>/src/auth.ts`
- `frontend/<name>/src/styles/app.css`
- `frontend/<name>/src/pages/LoginPage.tsx` (at minimum)
- `frontend/<name>/src/pages/DashboardPage.tsx` (at minimum)
- `public/<name>/.gitkeep`

### Frontend — modify (SPA portals only)
- `frontend/tsconfig.json` — add `{ "path": "<name>" }` reference
- `biome.jsonc` — add `"frontend/<name>/src/**/*.ts"`, `"frontend/<name>/src/**/*.tsx"`, `"frontend/<name>/vite.config.ts"` to `files.includes`

### Build / config — modify
- `Makefile` — add `dev:<name>` target; add `(cd frontend/<name> && exec npm run dev) &` line to the main `dev` target; add `cd frontend/<name> && npm run build` to the `build` target
- `.gitignore` — add `public/<name>/*` and `!public/<name>/.gitkeep`
- `Dockerfile` — add frontend build stage for the new portal (install deps, copy source, build)

### i18n — modify
- `locales/en/messages.json` — add `<name>.*` keys at minimum for login/dashboard
- `locales/zh/messages.json` — Chinese translations for same keys (per CLAUDE.md rule: every non-English locale must have every key)

## Core steps

Run in order. Skip SPA-related steps if Decision 3 = "API-only".

### 1. Invoke `new-model` for the auth actor

Run the `new-model` skill, specifically its `examples/authenticatable-model.md` trace, substituting `<Name>` for your portal's actor. That single invocation handles:

- `src/domain/models/<name>.rs` (struct + `hash_password` mutator + `impl HasToken` + `impl Authenticatable`)
- `src/domain/models/mod.rs` export
- `database/migrations/{timestamp}_create_<name>s.rs` (table with auth columns)
- `src/ids/guards.rs` (`Guard::<Name>` variant + match arm)
- `config/auth.toml` (`[auth.guards.<name>]` block)
- `src/providers/app_service_provider.rs` (`register_authenticatable::<<Name>>()?;` line)

Return here when it reports DONE. Run `make migrate` and `make check` to confirm the model is clean.

### 2. Create request / response DTOs

Path: `src/portals/<name>/requests.rs`

```rust
use async_trait::async_trait;
use forge::prelude::*;
use serde::Deserialize;

#[derive(Debug, Deserialize, ts_rs::TS, forge::ApiSchema)]
#[ts(export)]
pub struct <Name>LoginRequest {
    pub username: String,
    pub password: String,
}

#[async_trait]
impl RequestValidator for <Name>LoginRequest {
    async fn validate(&self, validator: &mut Validator) -> Result<()> {
        validator.field("username", &self.username).bail().required().apply().await?;
        validator.field("password", &self.password).bail().required().apply().await?;
        Ok(())
    }
}
```

Path: `src/portals/<name>/responses.rs` (admin-style — skip if User-style minimal)

```rust
use serde::Serialize;
use ts_rs::TS;

use crate::domain::models::<Name>;

#[derive(Serialize, TS, forge::ApiSchema)]
#[ts(export)]
pub struct <Name>MeResponse {
    pub id: String,
    pub username: String,
    pub email: String,
    pub name: String,
    pub locale: String,
    pub created_at: String,
    pub updated_at: String,
}

impl <Name>MeResponse {
    pub fn from_<name>(actor: &<Name>) -> Self {
        Self {
            id: actor.id.to_string(),
            username: actor.username.clone(),
            email: actor.email.clone(),
            name: actor.name.clone(),
            locale: actor.locale.clone(),
            created_at: actor.created_at.to_string(),
            updated_at: actor.updated_at.to_string(),
        }
    }
}
```

### 3. Create auth routes module

Path: `src/portals/<name>/auth_routes.rs`. Choose admin-style or user-style based on Decision 7.

**User-style (minimal — login + refresh only):**

```rust
use forge::prelude::*;

use crate::domain::services::auth_service;
use crate::portals::<name>::requests::<Name>LoginRequest;
use crate::validation::JsonValidated;

pub async fn login(
    State(app): State<AppContext>,
    i18n: I18n,
    JsonValidated(req): JsonValidated<<Name>LoginRequest>,
) -> Result<impl IntoResponse> {
    let tokens =
        auth_service::<name>_login_with_token(&app, &i18n, &req.username, &req.password).await?;
    Ok(Json(tokens))
}

pub async fn refresh(
    State(app): State<AppContext>,
    JsonValidated(req): JsonValidated<RefreshTokenRequest>,
) -> Result<impl IntoResponse> {
    let tokens = auth_service::refresh_<name>_token(&app, &req.refresh_token).await?;
    Ok(Json(tokens))
}
```

**Admin-style** additionally includes `logout`, `me`, and `ws_token` handlers — mirror `src/portals/admin/auth_routes.rs` exactly, substituting `<Name>` for `Admin`.

### 4. Register the portal's route scope

Path: `src/portals/<name>/mod.rs`

```rust
use forge::prelude::*;

use crate::ids::guards::Guard;
use crate::portals::<name>::requests::<Name>LoginRequest;

pub mod auth_routes;
pub mod requests;
pub mod responses;  // omit if not created

pub fn register(r: &mut HttpRegistrar) -> Result<()> {
    r.api_version(1, |r| {
        r.scope("/<name>", |portal| {
            portal.name_prefix("<name>");

            portal.scope("/auth", |auth| {
                auth.name_prefix("auth").tag("<name>:auth").public();

                auth.post("/login", "login", auth_routes::login, |route| {
                    route.summary("<Name> login (token)");
                    route.request::<<Name>LoginRequest>();
                    route.response::<TokenPair>(200);
                });

                auth.post("/refresh", "refresh", auth_routes::refresh, |route| {
                    route.summary("Refresh <name> access token");
                    route.request::<RefreshTokenRequest>();
                    route.response::<TokenPair>(200);
                });

                // Add /logout, /me, /ws-token if admin-style (guard with Guard::<Name>)

                Ok(())
            })?;

            // Add more scopes as the portal grows — /profile, /orders, etc.

            Ok(())
        })?;
        Ok(())
    })?;
    Ok(())
}
```

### 5. Wire portal registration into `src/portals/mod.rs`

Edit the existing `src/portals/mod.rs`:

```rust
pub mod admin;
pub mod <name>;        // ← add, alphabetical
pub mod spa;
pub mod user;

pub fn register(r: &mut HttpRegistrar) -> Result<()> {
    r.route("/health", get(health));
    admin::register(r)?;
    <name>::register(r)?;   // ← add
    user::register(r)?;
    Ok(())
}
```

### 6. Add SPA handler (skip if API-only)

Edit `src/portals/spa.rs`. Two changes:

**Add port const + cache slot near the top:**

```rust
const VITE_<NAME_UPPER>_PORT: u16 = 5175;   // or your chosen port
static <NAME_UPPER>_HTML: OnceLock<String> = OnceLock::new();
```

**Add the handler function:**

```rust
pub async fn <name>_spa(State(app): State<AppContext>) -> Result<Html<String>> {
    let config = config_script(&app).await?;

    if is_dev(&app) {
        Ok(Html(dev_html(
            "<Name> Portal",
            VITE_<NAME_UPPER>_PORT,
            "/<name>/",
            &config,
        )))
    } else {
        Ok(Html(inject_config(
            &prod_html("<name>", &<NAME_UPPER>_HTML),
            &config,
        )))
    }
}
```

Back in `src/portals/mod.rs`, extend `register_spa()`:

```rust
pub fn register_spa(r: &mut HttpRegistrar) -> Result<()> {
    use tower_http::services::ServeDir;

    r.route("/admin", get(spa::admin_spa));
    r.route("/admin/{*path}", get(spa::admin_spa));
    let admin_assets = Router::<AppContext>::new()
        .nest_service("/admin/assets", ServeDir::new("public/admin/assets"));
    r.merge(admin_assets);

    // ← NEW PORTAL BLOCK
    r.route("/<name>", get(spa::<name>_spa));
    r.route("/<name>/{*path}", get(spa::<name>_spa));
    let <name>_assets = Router::<AppContext>::new()
        .nest_service("/<name>/assets", ServeDir::new("public/<name>/assets"));
    r.merge(<name>_assets);

    // User portal is last (serves root + catches SPA fallback)
    let user_assets =
        Router::<AppContext>::new().nest_service("/assets", ServeDir::new("public/user/assets"));
    r.merge(user_assets);

    Ok(())
}
```

### 7. Add service-layer auth functions

Edit `src/domain/services/auth_service.rs`. Mirror `admin_login_with_token` / `refresh_admin_token` patterns, substituting `<Name>`:

```rust
pub async fn <name>_login_with_token(
    app: &AppContext,
    i18n: &I18n,
    username: &str,
    password: &str,
) -> Result<TokenPair> {
    // Look up actor, verify password via app.hash()?.verify(...),
    // issue tokens via the Authenticatable trait's token API. Mirror admin.
    todo!("see admin_login_with_token for the exact shape; substitute Admin → <Name>")
}

pub async fn refresh_<name>_token(
    app: &AppContext,
    refresh_token: &str,
) -> Result<TokenPair> {
    // Mirror refresh_admin_token.
    todo!("see refresh_admin_token")
}
```

These must compile at the end — replace the `todo!()` with working code patterned after the admin service.

### 8. (Skip if API-only) Scaffold the frontend

Copy the template portal directory:

```bash
cp -r frontend/user frontend/<name>
# or frontend/admin if you need the richer template
```

Then edit these files in the new copy:

**`frontend/<name>/package.json`** — change `name`:
```json
{ "name": "forge-starter-<name>", ... }
```

**`frontend/<name>/vite.config.ts`** — update port, base, outDir:
```ts
base: "/<name>/",
build: { outDir: "../../public/<name>", emptyOutDir: true },
server: { port: 5175, /* or your chosen port */ origin: "http://localhost:5175" },
```
(Keep or remove the `proxy` block based on whether the portal needs API proxying in dev.)

**`frontend/<name>/index.html`** — change title:
```html
<title><Name> Portal — Forge Starter</title>
```

**`frontend/<name>/src/api.ts`** — set the portal-specific baseURL:
```ts
import { createApi } from "@shared/api";

export const api = createApi({
  baseURL: "/api/v1/<name>",
  silentPaths: ["/auth/me", "/auth/refresh"],
});
```

**`frontend/<name>/src/auth.ts`** — bind the actor response type + paths:
```ts
import { createAuth } from "@shared/auth";
import type { <Name>MeResponse } from "@shared/types/generated";  // update import after make types
import { api } from "@/api";

export const auth = createAuth<<Name>MeResponse>({
  api,
  mode: "token",
  paths: {
    login: "/auth/login",
    refresh: "/auth/refresh",
    logout: "/auth/logout",   // omit if user-style
    me: "/auth/me",           // or "/me" for user-style
  },
});
```

**`frontend/<name>/src/router.tsx`** — set basename:
```ts
export const router = createBrowserRouter(
  [ /* routes */ ],
  { basename: "/<name>" },
);
```

**Scaffolded pages**: start with `LoginPage.tsx` (copy from user portal, adapt fields) and `DashboardPage.tsx` (placeholder). Grow from there.

### 9. (Skip if API-only) Register the frontend build wiring

**`frontend/tsconfig.json`** — add reference:
```json
{
  "files": [],
  "references": [
    { "path": "shared" },
    { "path": "admin" },
    { "path": "<name>" },
    { "path": "user" }
  ]
}
```

**`biome.jsonc`** — add includes:
```jsonc
"files": {
  "includes": [
    "frontend/admin/src/**/*.ts",
    "frontend/admin/src/**/*.tsx",
    "frontend/admin/vite.config.ts",
    "frontend/<name>/src/**/*.ts",
    "frontend/<name>/src/**/*.tsx",
    "frontend/<name>/vite.config.ts",
    "frontend/user/src/**/*.ts",
    "frontend/user/src/**/*.tsx",
    "frontend/user/vite.config.ts",
    "frontend/shared/**/*.ts",
    "frontend/shared/**/*.tsx",
    "!frontend/shared/dist/**",
    "!frontend/shared/types/generated/**"
  ]
}
```

**`Makefile`** — add `dev:<name>` target and wire into `dev`:

```makefile
dev\:<name>:
	cd frontend/<name> && npm run dev
```

In the `dev` target body, add the spawn line:
```makefile
dev: types
	@trap 'kill 0' EXIT; \
	(cd frontend/admin && exec npm run dev) & \
	(cd frontend/<name> && exec npm run dev) & \
	(cd frontend/user && exec npm run dev) & \
	(PROCESS=websocket exec bash scripts/watch-rust.sh cargo run) & \
	(PROCESS=scheduler exec bash scripts/watch-rust.sh cargo run) & \
	exec bash scripts/watch-rust.sh cargo run
```

In the `build` target, add `cd frontend/<name> && npm run build`.

**`.gitignore`** — add entries:
```
public/<name>/*
!public/<name>/.gitkeep
```

Create `public/<name>/.gitkeep` (empty file) to pin the directory.

**`Dockerfile`** — add frontend install + copy + build steps mirroring admin/user:
```dockerfile
COPY Forge-Starter/frontend/<name>/package.json /app/frontend/<name>/package.json
RUN cd /app/frontend/<name> && npm install

COPY Forge-Starter/frontend/<name>/ /app/frontend/<name>/

RUN mkdir -p /app/public/<name>

RUN cd /app/frontend/<name> && npm run build
```

### 10. (Optional) Add permissions

If Decision 5 was "simple" or "full RBAC":

- Invoke `new-permission` once per Permission variant (`<resource>.read`, `<resource>.manage`).
- Gate the portal's routes with `.permission(Permission::<New>)` on scopes.
- If the actor has its own `permissions: Vec<String>` column (admin-style RBAC), extend the model accordingly (handled during step 1 via `new-model`).

### 11. i18n

Add keys to `locales/en/messages.json`:

```json
{
  "<name>": {
    "login": {
      "title": "<Name> Login",
      "username": "Username",
      "password": "Password",
      "submit": "Sign in",
      "error": "Invalid credentials"
    },
    "dashboard": {
      "title": "<Name> Dashboard"
    }
  }
}
```

Mirror in `locales/zh/messages.json` with Chinese translations. Per CLAUDE.md, every non-English locale MUST have every key — do not skip.

## Verify

Run in order. Each must pass before moving on.

```bash
make migrate         # actor table exists
make types           # TS for the new DTOs + enums regenerates
make check           # Rust compiles
make lint            # clippy + Biome clean
```

Then start the dev servers (skip the new-frontend line if API-only):

```bash
make dev
```

Manual smoke:

1. Navigate to `http://localhost:5175/<name>/` (or wherever the new portal lives) — the LoginPage renders.
2. `POST /api/v1/<name>/auth/login` with the seeded actor's credentials — returns a `TokenPair`.
3. `GET /api/v1/<name>/auth/me` (if admin-style) with the access token — returns the actor profile.
4. Logout + refresh flow works.
5. The admin observability dashboard at `/_forge/*` still rejects the new actor (unless Decision 8 opted it in).

Build smoke:

```bash
make build
```

Produces `public/<name>/index.html` + assets. Smoke-serving in prod mode:

```bash
PROCESS= cargo run --release
```

Visit `http://localhost:3000/<name>/` — served from built assets.

## Don't

- **Don't skip the new-model skill for the auth actor.** Hand-rolling the struct + `impl Authenticatable + HasToken` + Guard variant + auth.toml + provider registration loses one or more steps every time. Use the skill.
- **Don't reuse an existing portal's Vite dev port.** Ports must be unique; collisions mean the second server fails silently or serves stale HTML.
- **Don't forget the `src/portals/spa.rs` update.** The route in `register_spa()` + the handler function + the port constant + the HTML cache all four need to exist together. Missing any one produces 404 or stale dev HTML.
- **Don't mismatch the URL prefix between REST and frontend.** REST at `/api/v1/<name>/`, Vite base at `/<name>/`. The frontend's `api.ts` uses `baseURL: "/api/v1/<name>"` — any mismatch breaks all API calls.
- **Don't register the new portal in `register_spa()` after the User portal's asset block.** The User portal serves assets at `/assets/` (no portal prefix); it must be registered last so it doesn't intercept other portals' asset paths.
- **Don't include the `proxy` block in `vite.config.ts` if the portal hits the same origin as the API in dev.** The proxy is only needed for cross-origin dev setups. User portal omits it; admin portal includes it. Copy the template that fits.
- **Don't hash passwords in the auth service.** The model's `write_mutator` handles it. The service calls `app.hash()?.verify(plaintext, &actor.password_hash)` to check; the `save()` path hashes via mutator.
- **Don't couple the portal's middleware to admin-only concerns.** The observability dashboard is Guard::Admin-gated; don't extend Guard::<Your> to it unless Decision 8 was explicit.
- **Don't skip locale entries in non-English files.** Every `<name>.*` key in `locales/en/messages.json` must have a matching entry in `locales/zh/messages.json`. CLAUDE.md hard rule.
- **Don't forget `public/<name>/.gitkeep` + `.gitignore`.** Without the `.gitkeep`, the empty `public/<name>/` directory isn't tracked and `make build` fails on Dockerfile copy steps.
- **Don't install new frontend dependencies as part of this skill.** Copy from the user or admin template as-is. If the new portal genuinely needs a different dep (e.g., a chart library), add it as a follow-up task with explicit approval — CLAUDE.md rule.
- **Don't rename `admin` or `user` to repurpose their paths.** Add a new portal instead; renaming breaks every hardcoded reference across auth.toml, Dockerfile, Makefile, .gitignore, Biome, tsconfig, `src/portals/mod.rs`, and `src/portals/spa.rs`.

## When this skill doesn't fit

- **Adding a feature (page / route / CRUD) inside an existing portal** → that portal's own territory. For admin CRUD pages, use `admin-datatable`. For admin badges, `admin-badge`.
- **Multi-tenant variants of an existing portal** (e.g., white-labelled merchant sub-portals) — escalate. Requires auth.toml dynamic guard sourcing, middleware tenancy, DB-level row scoping. Out of scope for this skill.
- **Replacing an existing portal's auth driver** (token → session, or introducing OAuth) — structural change. Escalate.
- **API-only microservice boundary** — if "new portal" really means "a standalone API binary without SPA or shared infrastructure", that's a different project layout entirely. This skill assumes single-binary + shared kernel.
- **Adding a mobile app that hits an existing portal's API** — no portal skill needed; the mobile app is a separate client. Use the existing portal's REST routes with a token obtained via its `/auth/login`.
