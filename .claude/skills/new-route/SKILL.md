---
name: new-route
description: Use when adding an individual backend REST route OR a frontend SPA route that isn't covered by a broader feature skill. Typical phrasings: "add a POST /admin/top-ups/{id}/approve action endpoint", "add a /health public endpoint", "webhook receiver for Stripe", "bulk-delete endpoint", "CSV export route", "add a frontend page at /reports/weekly without new backend", "expose a custom action route on an existing resource". Covers choosing portal + scope + method + auth, writing the handler, declaring request/response DTOs, registering in the portal's `mod.rs`, and — if applicable — adding the matching frontend SPA route entry + menu item. Do NOT use for: full admin CRUD list/create/edit/delete flow (→ `admin-datatable` ships all five routes inline); a whole admin page backed by a single show endpoint (→ `admin-page` covers this end-to-end); sidebar badges with their own REST+WS path (→ `admin-badge`); auth login/refresh/logout (→ `new-portal` scaffolds these); datatable generic query/download endpoints (those are registered globally; you don't add per-datatable); WebSocket channels (→ CLAUDE.md "WebSocket" section).
---

# New Route — add a single backend route, frontend SPA route, or both

## When to invoke

A developer needs a specific route that doesn't fit a broader feature skill. Typical phrasings:

- "add `POST /admin/top-ups/{id}/approve` — approval action"
- "add `POST /admin/users/{id}/reset-password`"
- "add `/health` public endpoint"
- "webhook receiver at `/webhooks/stripe`"
- "bulk-delete endpoint — `POST /admin/users/bulk-delete`"
- "CSV export route beyond the generic datatable one"
- "add a frontend page at `/reports/weekly` using existing backend"
- "add a detail page route on the frontend"

Do NOT invoke for:
- **Full admin CRUD** (list + create + edit + delete + menu) — `admin-datatable` ships all five routes inline + frontend.
- **A full page backed by one show endpoint** — `admin-page` covers the whole thing end-to-end.
- **Sidebar count badge with its own REST + WS path** — `admin-badge`.
- **Auth login / refresh / logout** — scaffolded by `new-portal` as part of the portal template.
- **Datatable generic query/download endpoints** — `/admin/datatables/<id>/query` and `/download` are registered globally in `src/portals/admin/mod.rs`; you don't add per-datatable routes.
- **WebSocket channels** — different subsystem; see CLAUDE.md "WebSocket" + `admin-badge` for real-time patterns.

## Concept

A backend route is declared inside a portal's scope in `src/portals/<portal>/mod.rs` using Forge's HTTP registrar fluent API:

```rust
scope.post("/path", "name", handler, |route| {
    route.summary("...");
    route.request::<ReqDto>();
    route.response::<ResDto>(200);
});
```

Each route carries: method (`get`/`post`/`put`/`patch`/`delete`), path (relative to the parent scope), a name (for reverse routing + OpenAPI), the handler function, and route metadata (summary, request/response DTO bindings, permission overrides). Scope-level guards + permissions propagate to every child route unless explicitly overridden.

A frontend SPA route is an entry in `frontend/<portal>/src/router.tsx`:

```tsx
{ path: "<slug>", element: <SomePage /> }
```

Paired: most backend routes surface in the frontend either as a direct fetch (from a page) or as a button handler. A frontend-only route (a page reusing existing endpoints) skips the backend half; a backend-only route (webhook, bulk action) skips the frontend half.

## Prerequisites

- [ ] The portal exists (admin / user / whatever you're adding to). Adding a whole portal is `new-portal`.
- [ ] The handler's service function exists OR you're creating it inline (keep handlers thin — extract → validate → service → respond).
- [ ] If the route is permission-gated, the `Permission` variant exists. Use `new-permission` if it doesn't.
- [ ] If the route takes / returns a DTO with new shape, know where the DTO will land (`src/portals/<portal>/{requests,responses}.rs`).

## Decisions — answer before writing code

1. **Backend, frontend, or both?** If backend only (webhook, ops) → skip frontend steps. If frontend only (page with existing endpoints) → skip backend steps.
2. **Portal** — which portal scope? `/admin`, `/user`, or another portal. Determines which `src/portals/<portal>/` file to edit.
3. **Path + method** — full path relative to portal (`/<resource>/{id}/approve`, method POST). Follows REST conventions: GET = read, POST = create or action, PUT = full update, PATCH = partial, DELETE = remove. Custom actions typically POST under a sub-path.
4. **Auth gate** — `.public()` (unauthenticated — rare, used for auth routes, webhooks, health), `.guard(Guard::<Name>)` (authenticated as that actor type), `.permission(Permission::<Name>)` (permission-checked), `.permissions([Permission::X, Permission::Y])` (AND — must hold all).
5. **Request shape** — path params only? Query params (for GET)? JSON body (POST/PUT/PATCH)? None?
6. **Response shape** — JSON DTO (typical)? `MessageResponse`? Raw bytes (export / download)? Redirect?
7. **Frontend route needed?** — if a user should navigate to the result of this endpoint, or if the action is triggered from a page, identify which page + whether a new route entry is needed.
8. **i18n** — does the response include user-visible text that must pass through `t!(i18n, "key")`? Usually yes — toasts on the frontend display backend messages.

## Backend steps

### 1. Add the request DTO (if the route takes a body)

Edit `src/portals/<portal>/requests.rs`:

```rust
#[derive(Debug, Deserialize, ts_rs::TS, forge::ApiSchema)]
#[ts(export)]
pub struct <Action>Request {
    pub <field_1>: String,
    pub <field_2>: Option<<YourEnum>>,
}

#[async_trait]
impl RequestValidator for <Action>Request {
    async fn validate(&self, validator: &mut Validator) -> Result<()> {
        validator.field("<field_1>", &self.<field_1>)
            .bail()
            .required()
            .min(1)
            .apply()
            .await?;
        Ok(())
    }
}
```

Skip if the route uses only path / query params.

### 2. Add the response DTO (if non-trivial)

Edit `src/portals/<portal>/responses.rs`:

```rust
#[derive(Serialize, ts_rs::TS, forge::ApiSchema)]
#[ts(export)]
pub struct <Result>Response {
    pub id: String,
    pub status: String,
    // ...
}
```

For boolean-ish or message-only responses, reuse `MessageResponse` from `forge::prelude` — don't create a DTO for every trivial return.

### 3. Implement the handler

Path: `src/portals/<portal>/<resource>_routes.rs` (or append to the existing file if one exists for this resource).

Pick the template matching the method.

#### Custom action (POST to a sub-path)

```rust
use axum::extract::{Path, State};
use forge::prelude::*;

use crate::domain::models::Admin;
use crate::domain::services::<resource>_service;
use crate::portals::admin::requests::<Action>Request;
use crate::portals::admin::responses::<Result>Response;

pub async fn <action>(
    State(app): State<AppContext>,
    i18n: I18n,
    AuthenticatedModel(actor): Auth<Admin>,
    Path(id): Path<String>,
    JsonValidated(req): JsonValidated<<Action>Request>,
) -> Result<impl IntoResponse> {
    let result = <resource>_service::<action>(&app, &i18n, &actor, &id, &req).await?;
    Ok(Json(<Result>Response::from(&result)))
}
```

#### GET (read, no body)

```rust
pub async fn <get_name>(
    State(app): State<AppContext>,
    i18n: I18n,
    AuthenticatedModel(_actor): Auth<Admin>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    let data = <resource>_service::<fetch>(&app, &i18n, &id).await?;
    Ok(Json(<Result>Response::from(&data)))
}
```

#### Public route (no auth)

Omit the `Auth<...>` extractor entirely:

```rust
pub async fn health(State(_app): State<AppContext>) -> Result<impl IntoResponse> {
    Ok(Json(serde_json::json!({ "status": "ok" })))
}
```

Register with `.public()` on the scope.

#### Webhook receiver

Same shape as public — sees the raw JSON body, verifies signature, returns 200 or an error.

```rust
use axum::http::HeaderMap;

pub async fn stripe(
    State(app): State<AppContext>,
    headers: HeaderMap,
    body: String,
) -> Result<impl IntoResponse> {
    crate::domain::services::webhook_service::handle_stripe(&app, &headers, &body).await?;
    Ok(Json(MessageResponse::new("ok")))
}
```

The `body: String` extractor captures the raw request body (needed for HMAC signature verification before JSON parsing).

#### Bulk action

```rust
#[derive(Debug, Deserialize, ts_rs::TS, forge::ApiSchema)]
#[ts(export)]
pub struct BulkDeleteRequest {
    pub ids: Vec<String>,
}

pub async fn bulk_delete(
    State(app): State<AppContext>,
    i18n: I18n,
    AuthenticatedModel(actor): Auth<Admin>,
    JsonValidated(req): JsonValidated<BulkDeleteRequest>,
) -> Result<impl IntoResponse> {
    let count = <resource>_service::bulk_delete(&app, &i18n, &actor, &req.ids).await?;
    Ok(Json(serde_json::json!({ "deleted": count })))
}
```

Keep bulk handlers thin — the service iterates + commits (typically in a transaction).

#### Export (CSV / XLSX)

```rust
use axum::body::Body;
use axum::http::header;
use axum::response::Response;

pub async fn export(
    State(app): State<AppContext>,
    AuthenticatedModel(_actor): Auth<Admin>,
) -> Result<Response> {
    let bytes = <resource>_service::export_csv(&app).await?;
    Ok(Response::builder()
        .header(header::CONTENT_TYPE, "text/csv")
        .header(
            header::CONTENT_DISPOSITION,
            format!("attachment; filename=\"<resource>-{}.csv\"", chrono::Utc::now().format("%Y%m%d")),
        )
        .body(Body::from(bytes))
        .map_err(Error::other)?)
}
```

### 4. Register the route (+ middleware if needed)

Edit `src/portals/<portal>/mod.rs`. Add to the appropriate scope.

If the route needs non-default middleware — rate limit, body size, timeout, CSRF, etc. — read the `middleware` skill first and add `.middleware_group("<name>")` on the scope OR a per-route override in the `|route| { ... }` closure. Example: tighter rate limit on login:

```rust
scope.post("/auth/login", "login", auth_routes::login, |route| {
    route.public();
    route.rate_limit(RateLimit::new(5).per_minute());
    route.summary("Admin login (token)");
});
```

Base registration template:

```rust
// Inside e.g. admin.scope("/<resource>s", |scope| { ... })
scope.post("/{id}/<action>", "<action>", <resource>_routes::<action>, |route| {
    route.permissions([Permission::<Resource>Manage]);
    route.summary("<Action> a <resource>");
    route.request::<<Action>Request>();
    route.response::<<Result>Response>(200);
});
```

Name the route following the scope's convention: the name is the short verb (`approve`, `bulk_delete`, `export`). Combined with the scope's `name_prefix`, the full route name becomes e.g. `admin.<resource>s.<action>`.

**Permission overrides**: scope-level `.permission(Permission::X)` propagates to children; override per-route with `.permissions([Permission::Y])`. Reading the Permission enum: `Permission::<Resource>Read` for GET, `Permission::<Resource>Manage` for mutating actions (default convention).

**Public / no-auth routes**: use a scope with `.public()`:

```rust
admin.scope("/webhooks", |wh| {
    wh.name_prefix("webhooks").tag("webhooks").public();
    wh.post("/stripe", "stripe", webhook_routes::stripe, |route| {
        route.summary("Stripe webhook receiver");
    });
    Ok(())
})?;
```

### 5. Service function

Path: `src/domain/services/<resource>_service.rs` (or create it if not yet there).

```rust
pub async fn <action>(
    app: &AppContext,
    i18n: &I18n,
    _actor: &Admin,
    id: &str,
    req: &<Action>Request,
) -> Result<<SomeDomainType>> {
    let transaction = app.begin_transaction().await?;

    // Business logic. Use model builders, never raw SQL unless the builder can't express it.
    let record = <Resource>::model_query()
        .where_eq(<Resource>::ID, id)
        .first(&transaction)
        .await?
        .ok_or_else(|| Error::http(404, t!(i18n, "error.not_found")))?;

    let updated = record
        .update()
        .set(<Resource>::STATUS, <StatusEnum>::Approved)
        .save(&transaction)
        .await?;

    transaction.commit().await?;
    Ok(updated)
}
```

Per CLAUDE.md: portals are THIN. The handler parses + calls; the service is where business logic lives.

### 6. Regenerate types

```bash
make types
```

Any new request/response DTO must appear in `frontend/shared/types/generated/` before frontend consumption compiles.

### 7. Verify backend

```bash
make check
make lint
```

Smoke test with `make dev`:
- `curl -X POST http://localhost:3000/api/v1/<portal>/<path> ...` exercises the endpoint directly, OR
- Trigger via the frontend if a matching button / page exists.

## Frontend steps

Run only if the route has a matching frontend consumer. Four sub-variants:

### Variant A — Button click triggers the endpoint (no new SPA route)

The backend endpoint is called from an existing page's button. No new SPA route entry needed.

```tsx
import { Button } from "@shared/components";
import { api } from "@/api";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

function ApproveButton({ topupId, onSaved }: { topupId: string; onSaved?: () => void }) {
  const { t } = useTranslation();
  const handle = async () => {
    await api.post(`/top-ups/${topupId}/approve`, {});
    toast.success(t("admin.top_ups.approved"));
    onSaved?.();
  };
  return <Button onClick={handle} size="sm">{t("Approve")}</Button>;
}
```

This fits into an existing `admin-datatable` row action or detail page. No new route registration.

### Variant B — New SPA route to a new page

A fresh page that lives at a new URL. Add the router entry:

```tsx
// frontend/<portal>/src/router.tsx
{ path: "<slug>", element: <<Name>Page /> },
```

Add a menu entry if the page should be reachable from the sidebar:

```ts
// frontend/<portal>/src/config/side-menu.ts
{
  key: "<group>.<name>",
  label: "admin.<name>.title",
  path: "/<slug>",
  permission: "<module>.<action>",
}
```

Build the page per the `admin-page` skill (for non-CRUD) or `admin-datatable` (for lists).

### Variant C — Export / download

Trigger a download:

```tsx
<Button
  onClick={() => {
    window.location.href = "/api/v1/admin/<resource>/export";
  }}
>
  {t("Export CSV")}
</Button>
```

Axios isn't used — browser navigation triggers the download via `Content-Disposition: attachment` header. No new SPA route.

### Variant D — Frontend-only page (no new backend)

A page that reuses existing endpoints. Add only the router entry + optional menu. Backend untouched. See `admin-page` for the page component shape.

## Don't

- **Don't put business logic in the route handler.** Handlers are thin — extractors, validation, service call, response. Per CLAUDE.md "Portals are THIN".
- **Don't hardcode permission strings.** Use `Permission::<Variant>` from `src/ids/permissions.rs`. If a new permission is needed, `new-permission` adds it first.
- **Don't skip the response DTO type binding** (`route.response::<T>(200)`). It's what feeds OpenAPI docs + the TypeScript generator.
- **Don't forget `make types`** after adding a DTO. Frontend consumers will be `any`-typed until regenerated.
- **Don't catch API errors in the handler to swallow them.** Let `Result<Err>` propagate — the framework's error middleware converts to structured JSON responses with i18n'd messages.
- **Don't use raw SQL in the handler** when the model builder covers the operation. Same SSOT rule as everywhere else.
- **Don't return raw English strings from the handler.** Any user-visible message uses `t!(i18n, "key")` (CLAUDE.md hard rule — the frontend displays backend messages in toasts).
- **Don't add a frontend SPA route without a matching menu entry** unless the route is only reachable via navigation from another page (e.g., `/users/:id` reachable from a row click). Orphan routes are dead code.
- **Don't add an auth-less backend route** without a real reason. Webhooks (with signature verification), health checks, and public config are the legitimate cases. Default to `.guard(Guard::X)` or `.permission(Permission::X)`.
- **Don't hand-name new route modules** if a `make:` scaffolder exists. Currently only `make:model` / `make:migration` / `make:seeder` / `make:job` / `make:command` — not `make:route` — so route files are the one place hand-naming is fine (there's no scaffolder). But still follow the convention: `<resource>_routes.rs` under the portal directory.

## When this skill doesn't fit

- **Full admin CRUD flow** → `admin-datatable` (handles all 5 routes + frontend + modals + i18n).
- **Admin page backed by a single show endpoint** → `admin-page` (handles the page + route + menu + i18n).
- **Sidebar count indicator** → `admin-badge` (has its own REST snapshot + WS channel wiring).
- **Auth routes (login / refresh / logout)** → `new-portal` scaffolds these.
- **Datatable `/query` / `/download`** — those are globally registered; don't add per-resource.
- **WebSocket channels** — different subsystem; CLAUDE.md "WebSocket" + `admin-badge` for real-time counts.
- **Configuring middleware** (rate limits, CORS, CSRF, body size, timeouts) → `middleware` skill. This skill references it in Decision 5 / Step 4; the full built-in catalog + per-route override syntax lives there.
- **GraphQL / gRPC / other non-REST APIs** — not part of this starter.
- **Changing an existing route's path or method** — schema-breaking change; not a skill concern. Update the route, regenerate TS, fix all frontend consumers.
