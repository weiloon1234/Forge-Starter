## What This Is

Portal-scoped discipline for anything under `src/portals/`. Every HTTP route in the app lives here, grouped by portal (`admin/`, `user/`, future portals). Authoritative procedures live in skills under `.claude/skills/`; this file is the local waypoint — naming conventions, scope-DSL visual, file tree, and the rule that handlers are THIN.

## Skills for portal work

| Skill | Use when |
|---|---|
| [`new-route`](../../.claude/skills/new-route/SKILL.md) | Adding a single REST route — custom action, webhook, health, bulk, export, frontend-only SPA route |
| [`admin-datatable`](../../.claude/skills/admin-datatable/SKILL.md) | Full admin CRUD page (all 5 routes + frontend + modals + menu + i18n) |
| [`admin-page`](../../.claude/skills/admin-page/SKILL.md) | Non-datatable admin page (dashboard, detail, workflow, settings, report, viewer) |
| [`admin-badge`](../../.claude/skills/admin-badge/SKILL.md) | Sidebar count indicator (owns its REST snapshot + WS channel) |
| [`new-portal`](../../.claude/skills/new-portal/SKILL.md) | Whole new portal (new login actor + scope + SPA) |
| [`new-permission`](../../.claude/skills/new-permission/SKILL.md) | New RBAC variant on the `Permission` enum |
| [`middleware`](../../.claude/skills/middleware/SKILL.md) | Configuring per-route or per-scope middleware (RateLimit, Csrf, CORS, MaxBodySize, RequestTimeout) |

Root `CLAUDE.md` indexes all 21 skills. Frontend-facing counterparts (pages, forms, shared components) live in `frontend/CLAUDE.md`.

## Route scope DSL at a glance

Routes live in `portals/{portal}/mod.rs` using Forge's fluent scope DSL. Group defaults (`name_prefix`, `tag`, `guard`, `permission`) cascade into nested scopes; individual routes override with their own `.guard()`, `.permission()`, `.permissions([...])`, or `.public()`.

```rust
r.api_version(1, |r| {
    r.scope("/admin", |admin| {
        admin.name_prefix("admin");

        admin.scope("/users", |users| {
            users
                .name_prefix("users")
                .tag("admin:users")
                .guard(Guard::Admin)
                .permission(Permission::UsersRead);

            users.get("", "index", user_routes::index, |route| {
                route.summary("List users (paginated)");
                route.response::<UserListResponse>(200);
            });

            users.post("", "store", user_routes::store, |route| {
                route.permissions([Permission::UsersManage]);
                route.summary("Create user");
                route.request::<CreateUserRequest>();
                route.response::<UserResponse>(201);
            });

            Ok(())
        })?;

        Ok(())
    })?;
    Ok(())
})?;
```

Every route MUST have:

1. **Name** — second positional arg, relative to the scope. Composed to `{portal}.{resource}.{action}` by `name_prefix` cascade.
2. **Summary** — `route.summary("...")` feeds OpenAPI / `make api-docs`.
3. **Request DTO** — `route.request::<T>()` on POST / PUT / PATCH routes. Must derive `forge::ApiSchema + ts_rs::TS + #[ts(export)]`.
4. **Response DTO** — `route.response::<T>(status)` wherever the response shape is known. Same derives.
5. **Access** — inherited from scope (`.guard()` / `.permission()`) OR declared on the route (`.public()` / `.permissions([...])`).

## Naming + tag conventions

**Route names**: `{portal}.{resource}.{action}` — produced automatically by scope composition.

```
admin.auth.login             admin.users.index            user.auth.login
admin.auth.logout            admin.users.show             user.auth.refresh
admin.auth.me                admin.admins.store           user.me.show
admin.auth.ws_token          admin.admins.update          user.me.update
admin.badges.index           admin.admins.destroy
admin.datatables.query       admin.<resource>.<custom>    (approve, bulk_delete, export, etc.)
admin.datatables.download
```

**Tags**: `{portal}:{resource}` — set once per scope with `.tag("admin:users")`. Used by OpenAPI for grouping.

```
admin:auth    admin:users    admin:admins    admin:datatables    admin:badges
user:auth     user:profile
```

## File structure per portal

```
src/portals/{portal}/
├── mod.rs                      # register() — api_version + nested scopes
├── auth_routes.rs              # Auth handlers (login / refresh / logout / me / ws_token)
├── {resource}_routes.rs        # Per-resource handlers (index, show, store, update, destroy, custom)
├── requests.rs                 # Request DTOs (Deserialize + ts_rs::TS + forge::ApiSchema; RequestValidator impls OR #[derive(Validate)])
├── responses.rs                # Response DTOs (Serialize + ts_rs::TS + forge::ApiSchema)
├── resources.rs                # ApiResource impls (model → response-DTO transform helpers, when reused)
├── datatables/                 # Datatable trait impls per resource
│   ├── mod.rs                  # register_all() + run_json() + run_download()
│   └── {resource}_datatable.rs
├── datatable_routes.rs         # Generic datatable handlers (query, download) + permission map
└── badge_routes.rs             # Admin-only — badge snapshot endpoint (see admin-badge skill)
```

`auth_routes.rs` + `datatables/` + `datatable_routes.rs` are scaffolded by `new-portal` when a portal is created. Everything else is added per-feature via `new-route` / `admin-datatable` / `admin-page`.

## Request / Response DTO rules

A DTO in `requests.rs` / `responses.rs` is not just the wire shape — it's the **single source for four roles at once**: (1) server-side validation, (2) HTTP payload + OpenAPI schema, (3) generated TypeScript type in `frontend/shared/types/generated/`, (4) the React form's value type via `useForm<CreateFooRequest>`. One Rust struct, four lenses. The frontend never reimplements validation, never hand-writes a parallel TS Request, and defaults to typing forms against the generated type — not against a hand-maintained `FormValues` interface. Full discipline lives in `frontend/CLAUDE.md` "SSOT — Rust → TypeScript"; full procedures in the skills. This section is the backend shape rule.

**Preferred for simple validation** — `#[derive(Validate)]` alongside `ts_rs::TS` + `forge::ApiSchema`:

```rust
#[derive(Debug, Deserialize, ts_rs::TS, forge::ApiSchema, Validate)]
#[ts(export)]
pub struct CreateSomethingRequest {
    #[validate(required, email)]
    pub email: String,
    #[validate(required, min(2))]
    pub name: String,
}
```

**Manual `impl RequestValidator`** — when validation is runtime-driven, conditional, or depends on **custom rule IDs** (`.rule(ids::validation::X)`). The starter's existing DTOs use this path because they call custom rules like `ACTIVE_COUNTRY`, `MOBILE`, `USERNAME`, `PASSWORD`:

```rust
#[async_trait]
impl RequestValidator for CreateSomethingRequest {
    async fn validate(&self, validator: &mut Validator) -> Result<()> {
        validator.field("email", &self.email)
            .bail().required().email()
            .apply().await?;
        validator.field("username", &self.username)
            .bail().required().rule(ids::validation::USERNAME)
            .apply().await?;
        Ok(())
    }
}
```

Skills:
- Add a route + the DTO it needs → `new-route`
- Add a whole CRUD with request/response DTOs → `admin-datatable`
- Add a new custom validation rule → `new-validation-rule`
- TypeScript pipeline for generated DTOs → `typescript`

Every response struct derives:

```rust
#[derive(Serialize, ts_rs::TS, forge::ApiSchema)]
#[ts(export)]
pub struct SomethingResponse { ... }
```

Never hand-write the matching TypeScript. `make types` emits it to `frontend/shared/types/generated/`. See `typescript` skill + `frontend/CLAUDE.md`'s "SSOT — Rust → TypeScript" section.

## Handler rules

**Handlers are THIN.** Extract request, validate, call service, return response. Business logic lives in `src/domain/services/<resource>_service.rs`, not in route handlers. This is CLAUDE.md's "Portals are THIN" architecture rule.

For JSON-body endpoints, use the `JsonValidated<T>` extractor — it runs the request DTO's validation before the handler body:

```rust
pub async fn store(
    State(app): State<AppContext>,
    i18n: I18n,
    AuthenticatedModel(actor): Auth<Admin>,
    JsonValidated(req): JsonValidated<CreateSomethingRequest>,
) -> Result<impl IntoResponse> {
    let created = something_service::create(&app, &i18n, &actor, &req).await?;
    Ok((StatusCode::CREATED, Json(SomethingResponse::from(&created))))
}
```

Common extractors in this codebase:

- `State(app): State<AppContext>` — framework context (DB, email, jobs, ws, resolve)
- `i18n: I18n` — translation macro helper for `t!(i18n, "key")`
- `AuthenticatedModel(actor): Auth<<Model>>` — resolves the authenticated actor; rejects unauthenticated requests automatically
- `Path(id): Path<String>` — URL path parameter
- `JsonValidated(req): JsonValidated<<Request>>` — validated JSON body
- `Query(q): Query<<Query>>` — query-string DTO

Any user-visible string the handler returns (toast message, error detail) must go through `t!(i18n, "key")`. Raw English in handlers is banned (root CLAUDE.md rule).
