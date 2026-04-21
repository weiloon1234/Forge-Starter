---
name: middleware
description: Use when choosing or configuring HTTP middleware for routes — global, named-group, or per-scope application. Typical phrasings: "rate-limit this endpoint more aggressively", "which middleware applies to admin routes", "add CORS headers for a specific route", "enable CSRF protection for a page route but not API", "increase body size limit for a file upload endpoint", "request timeout for a slow export", "apply compression to downloads", "middleware order / precedence", "can I write a custom middleware". Reference of Forge's built-in middleware set + the apply-at-what-level decision + per-route configuration overrides. Covers what middleware already runs globally on every request, what `api` / `web` groups are composed of, and how to opt a scope / route into a group or override a single setting. Do NOT use for: writing a bespoke axum `tower::Layer` or custom middleware type — Forge's `MiddlewareConfig` is a closed enum covering the built-in set; custom extension is not a supported pattern (escalate if you genuinely need it). Adding a new route (→ `new-route`); authentication/authorization (→ `new-permission` + `.guard(...)` / `.permission(...)` on routes); WebSocket channel auth (different subsystem).
---

# Middleware — built-in HTTP middleware + how to apply it

## When to invoke

A developer is deciding which middleware applies to a route / scope, adjusting middleware configuration per-route, or wondering what's already running. Typical phrasings:

- "rate-limit this endpoint more aggressively than the default"
- "which middleware runs on admin routes"
- "enable CORS for a specific public endpoint"
- "increase the body size limit for a file upload"
- "request timeout for a long-running export"
- "CSRF for the web UI, skip for the JSON API" (already the default; confirm)
- "what's in the `api` vs `web` middleware group"
- "middleware execution order"
- "can I write a custom middleware" (short answer: no — Forge's set is closed)

Do NOT invoke for:
- **Writing a new middleware type** — Forge's `MiddlewareConfig` is a closed enum of built-in variants. There's no public trait to implement. If you truly need custom behavior (unusual auth flow, domain-specific header inspection, bespoke logging), escalate — work it through a route-level extractor / service call / event instead.
- **Adding a route** → `new-route` (which references this skill when middleware decisions surface).
- **Auth / permission gating** — those are `.guard(Guard::X)` / `.permission(Permission::Y)` on the route/scope, separate from middleware. Middleware handles CORS, rate limiting, CSRF, compression, etc.; it doesn't decide *who* can call the route.
- **WebSocket** — different subsystem with its own channel guards.

## Concept

Middleware in this starter is fully declarative. You don't implement a trait; you pick a built-in, configure it, and register it at one of three levels:

1. **Global** — applies to every HTTP route in the binary. Registered via `AppBuilder::register_middleware(cfg.build())` in `src/bootstrap/http.rs`.
2. **Named group** — a set of middlewares applied when a scope / route opts into the group by name. Registered via `AppBuilder::middleware_group("<name>", vec![cfg1.build(), cfg2.build()])`.
3. **Per-scope / per-route** — a scope can call `.middleware_group("<name>")`; an individual route can override config (e.g., a route-specific RateLimit).

Forge applies middleware in **priority order**, not registration order. Lower priority = outer layer (runs first on request, last on response). The order is fixed per middleware type, not configurable.

**Closed enum — built-ins only.** `forge::http::middleware::MiddlewareConfig` is a `#[derive(Clone, Debug)]` enum whose variants are the complete set listed below. User code constructs instances via the builder types (`Cors::new()`, `RateLimit::new(100)`, etc.) and calls `.build()` to convert into `MiddlewareConfig`. There's no public `Middleware` trait to impl.

## What's already running globally in this starter

From `src/bootstrap/http.rs`:

```rust
super::app::base()
    .register_routes(portals::register)
    .register_routes(portals::register_spa)
    .register_middleware(Compression.build())
    .register_middleware(Cors::new().allow_any_origin().build())
    .middleware_group("api", vec![RateLimit::new(1000).per_hour().build()])
    .middleware_group("web", vec![
        Csrf::new().exclude("/api").build(),
        SecurityHeaders::new().build(),
    ])
```

- **Global**: `Compression` + `Cors` (allow any origin). Applied to every HTTP route.
- **`api` group**: `RateLimit` at 1000/hour. Opted into by any scope calling `.middleware_group("api")`.
- **`web` group**: `Csrf` (excluding `/api` paths) + `SecurityHeaders`. Opted into by any scope calling `.middleware_group("web")`.

No scope in the starter currently opts into `api` or `web` groups by default — those are available but not applied automatically. Admin/User portal routes run with only the global middleware (Compression + Cors). Adding `.middleware_group("api")` to a portal scope applies RateLimit; adding `.middleware_group("web")` applies Csrf + SecurityHeaders.

## The full built-in set

Priority column = execution order (lower = outer / runs first on request).

| Priority | Middleware | Purpose | Builder |
|---|---|---|---|
| 0 | `TrustedProxy` | Honor `X-Forwarded-*` headers for IP / scheme detection when behind a reverse proxy | `TrustedProxy::new(...)` |
| 1 | `MaintenanceMode` | Return 503 with a maintenance response when the app is in maintenance (via `PROCESS=cli cargo run -- down`) | auto — enabled by `make down`/`up` commands |
| 10 | `Cors` | Cross-origin resource sharing headers | `Cors::new().allow_any_origin()` / `.allow_origins([...])` / `.allow_methods([...])` / etc. |
| 20 | `SecurityHeaders` | `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Strict-Transport-Security`, etc. | `SecurityHeaders::new()` |
| 25 | `Csrf` | Cross-site request forgery token validation (double-submit cookie) | `Csrf::new().exclude(path_prefix)` |
| 30 | `RateLimit` | Request count / window limiting | `RateLimit::new(n).per_hour()` / `.per_minute()` / `.per_second()` |
| 40 | `MaxBodySize` | Reject requests whose body exceeds N bytes | `MaxBodySize::new(n)` |
| 50 | `RequestTimeout` | Abort requests that run longer than N seconds | `RequestTimeout::new(seconds)` |
| 55 | `ETag` | Emit + honor `ETag` / `If-None-Match` for 304 responses | `ETag::new()` |
| 60 | `Compression` | gzip / brotli response bodies | `Compression` (unit struct — `.build()` on it) |

All builders have a `.build()` method that returns `MiddlewareConfig`. You always end a middleware declaration with `.build()`.

## Decisions — answer when your scenario requires them

### 1. At what level should this middleware apply?

- **Global** (`register_middleware`) — runs on every route. Use for broadly-applicable concerns: compression, CORS baseline. Currently: `Compression`, `Cors`.
- **Named group** (`middleware_group`) — opt-in by scope / route. Use when a set of middlewares always goes together for a category of routes. Currently: `api` (rate limit), `web` (CSRF + security headers).
- **Per-scope** (`.middleware_group("<name>")` on a scope) — apply an existing group to this entire scope.
- **Per-route** — route-specific overrides (e.g., a slow export endpoint with a longer `RequestTimeout`). Uses the route's `|route| { ... }` closure.

Rule of thumb: if every route needs it, global. If a category of routes needs it, a group. If one route needs special config, a route-level override.

### 2. Do you need a new named group?

Most cases don't. Before adding a group, check if an existing group fits. New groups live in `src/bootstrap/http.rs` alongside `api` and `web`. Adding a group is a bootstrap change, not a route change — keep it rare.

### 3. Do you need to override config per-route?

Yes when:
- One route needs a **different rate limit** than the scope's default (e.g., `/login` with tighter limits for abuse protection).
- One route needs a **larger body size** (file upload).
- One route needs a **longer timeout** (data export).
- One route needs **CORS relaxed** for a specific origin (webhook callback).

No when:
- The middleware should apply uniformly across the scope — use the scope-level setting.

### 4. Is Forge's built-in set insufficient?

If you genuinely need a behavior that none of the 10 built-ins provide, the answer is NOT "add a custom middleware". The options are:

- **Extractor / handler logic** — move the per-request check into a custom axum extractor or into the service function. Middleware isn't the only layer for per-request behavior.
- **Event listener** — if the concern is cross-cutting but async, listen to `ModelCreated/Updated/DeletedEvent` or a custom domain event.
- **Escalate** — if it's genuinely middleware-shaped (runs on every request for a layer) and none of the built-ins fit, it's a Forge framework contribution, not app-level work.

## Application patterns

### Apply an existing group to a portal scope

Inside `src/portals/<portal>/mod.rs`, chain `.middleware_group("<name>")` when defining the scope:

```rust
admin.scope("/resources", |scope| {
    scope
        .name_prefix("resources")
        .tag("admin:resources")
        .guard(Guard::Admin)
        .permission(Permission::ResourcesRead)
        .middleware_group("api");   // ← applies RateLimit from the api group

    scope.get("", "index", routes::index, |route| { ... });
    Ok(())
})?;
```

All routes in the scope inherit the group.

### Apply a group to a single route

The per-route closure supports `.middleware_group(...)`:

```rust
scope.post("/webhooks/stripe", "stripe", webhook_routes::stripe, |route| {
    route.public();
    route.middleware_group("api");   // opt this single route into rate limiting
    route.summary("Stripe webhook receiver");
});
```

### Override rate limit for a specific route

The `route.rate_limit(...)` shortcut replaces any inherited RateLimit with a route-specific one:

```rust
scope.post("/auth/login", "login", auth_routes::login, |route| {
    route.public();
    route.rate_limit(RateLimit::new(5).per_minute());   // stricter than group default
    route.summary("Admin login (token)");
});
```

### Register a global middleware

Edit `src/bootstrap/http.rs`:

```rust
super::app::base()
    .register_routes(portals::register)
    .register_routes(portals::register_spa)
    .register_middleware(Compression.build())
    .register_middleware(Cors::new().allow_any_origin().build())
    .register_middleware(MaxBodySize::new(10 * 1024 * 1024).build())   // ← new: 10 MiB global cap
    // ... rest
```

Global middleware applies to every HTTP route. Use sparingly; prefer groups / scope-level application unless the concern is truly universal.

### Define a new named group

Edit `src/bootstrap/http.rs`:

```rust
.middleware_group("uploads", vec![
    MaxBodySize::new(50 * 1024 * 1024).build(),    // 50 MiB
    RequestTimeout::new(120).build(),              // 2 min timeout
])
```

Portals opt in via `scope.middleware_group("uploads")`.

### Apply multiple groups to one scope

Currently each scope has one group slot (`middleware_group_name: Option<String>`). If you need two middleware sets to compose, either define a third group that includes both, or register the additional middleware at the route level.

## Configuration cheatsheet per middleware

### `Cors`

```rust
Cors::new()
    .allow_origin("https://example.com")                 // specific origin
    .allow_origins(vec!["https://a.com", "https://b.com"])
    .allow_any_origin()                                  // wildcard — dev / public APIs
    .allow_methods([axum::http::Method::GET, axum::http::Method::POST])
    .allow_headers([axum::http::header::CONTENT_TYPE])
    .allow_credentials(true)
    .max_age(std::time::Duration::from_secs(3600))
    .build()
```

Default (`Cors::new().build()`) is restrictive. Current starter uses `.allow_any_origin()` globally — appropriate for a starter; tighten in production.

### `SecurityHeaders`

```rust
SecurityHeaders::new()
    .content_security_policy("default-src 'self'")
    .frame_options_deny()
    .x_content_type_options_nosniff()
    .referrer_policy("strict-origin-when-cross-origin")
    .hsts_max_age(31_536_000)                           // 1 year
    .build()
```

`SecurityHeaders::new().build()` applies sensible defaults. Customize only if you have a specific CSP or frame-options requirement.

### `Csrf`

```rust
Csrf::new()
    .exclude("/api")                                    // skip CSRF for JSON APIs
    .exclude("/webhooks")
    .cookie_name("forge_csrf")                          // default is usually fine
    .build()
```

CSRF applies only to form-based web routes. JSON APIs (token-authenticated) don't need CSRF — the starter excludes `/api`.

### `RateLimit`

```rust
RateLimit::new(1000).per_hour().build()
RateLimit::new(5).per_minute().build()                 // stricter — e.g., login
RateLimit::new(60).per_second().build()                // very permissive
```

Applied per-IP by default. Route-level override uses `.rate_limit(...)` in the route closure.

### `MaxBodySize`

```rust
MaxBodySize::new(10 * 1024 * 1024).build()             // 10 MiB
```

Reject requests whose body exceeds the limit with 413 Payload Too Large. For file-upload endpoints, set higher per-scope or per-route.

### `RequestTimeout`

```rust
RequestTimeout::new(30).build()                        // 30 seconds
RequestTimeout::new(300).build()                       // 5 minutes — long exports
```

Aborts the request if the handler runs past the limit. Errors return 504 Gateway Timeout.

### `ETag`

```rust
ETag::new().build()
```

Hashes the response body + emits `ETag` header. When the client sends `If-None-Match` with the same value, returns 304 Not Modified with no body. Useful for cacheable read endpoints (GET lists, static-ish data).

### `Compression`

```rust
Compression.build()
```

Unit struct — no configuration. Gzip / brotli based on the client's `Accept-Encoding`. Applies to all responses when registered globally; adds Vary header.

### `TrustedProxy`

```rust
TrustedProxy::new(vec!["10.0.0.0/8", "172.16.0.0/12"]).build()
```

Tells Forge which upstream IPs are trusted to set `X-Forwarded-For` / `X-Forwarded-Proto`. Required when the starter is behind a reverse proxy (Nginx, CDN). Without this, the app sees the proxy's IP, not the client's.

### `MaintenanceMode`

Auto-registered. Controlled via CLI:

```bash
PROCESS=cli cargo run -- down                          # enter maintenance mode
PROCESS=cli cargo run -- up                            # exit
```

While in maintenance, all non-excluded routes return 503 with a configurable response. Useful during deploys.

## Middleware precedence + interaction

Execution order (priority column above): **request flows outside-in**, **response flows inside-out**.

- TrustedProxy (0) → MaintenanceMode (1) → Cors (10) → SecurityHeaders (20) → Csrf (25) → RateLimit (30) → MaxBodySize (40) → RequestTimeout (50) → ETag (55) → Compression (60) → **handler** → Compression → ETag → RequestTimeout → ... → TrustedProxy.

Implications:

- `TrustedProxy` runs first so every downstream middleware sees the real client IP.
- `MaintenanceMode` runs before `Cors` — a maintenance response can still include CORS headers (correct; the client should be able to read the 503 body cross-origin in dev).
- `RateLimit` runs before `MaxBodySize` / `RequestTimeout` — rate-limited requests are rejected before body is parsed or the handler times out.
- `Compression` runs last on responses — body is already finalized, then compressed.

Custom priorities aren't configurable. If you need different behavior, it's a Forge framework concern; escalate.

## Verify

When changing middleware in `src/bootstrap/http.rs`:

```bash
make check
make lint
```

Then smoke:

```bash
make dev
# In another terminal, exercise the affected route and confirm:
# - headers (CORS / security) appear or are absent per the new config
# - rate limit triggers after N requests
# - timeout / body size limits return 504 / 413 as expected
```

Because middleware is applied at bootstrap, any change requires a restart — `make dev` handles that via the Rust auto-watch.

## Don't

- **Don't write a custom `Middleware` trait impl.** `MiddlewareConfig` is a closed enum; no extension point. If you're reaching for "custom middleware", reconsider — the logic probably belongs in a handler, extractor, service, or event listener.
- **Don't disable `Csrf` globally.** It's already excluded for `/api` (the JSON API path). Don't remove the CSRF group entirely to make your life easier; understand which routes need it (web / form-based) vs which don't (JSON + token-auth).
- **Don't stack multiple groups on one scope.** Current scope API supports one `middleware_group` at a time. If you need multiple, define a composite group at the bootstrap level.
- **Don't put auth in middleware.** Use `.guard(Guard::X)` / `.permission(Permission::Y)` on the scope / route. Middleware handles cross-cutting HTTP concerns; auth decisions are route-level.
- **Don't forget to call `.build()`** on builder types. `Cors::new().allow_any_origin()` returns the builder; `Cors::new().allow_any_origin().build()` returns the `MiddlewareConfig`. `register_middleware` expects the config.
- **Don't set `.allow_any_origin()` in production** for authenticated APIs. The starter uses it as a dev default; tighten before shipping.
- **Don't set absurdly high body size or timeout without a reason.** Both are abuse-mitigation surfaces. Raise them deliberately per route / per group for endpoints that legitimately need them (uploads, exports); leave the global default restrictive.
- **Don't modify Forge framework middleware implementations.** They live in Forge's git dependency; pin the commit and extend at the app level via configuration, never by forking.

## When this skill doesn't fit

- **Adding a route** → `new-route` (references this skill when middleware decisions matter).
- **Adding a whole module** → `new-module` (references this skill in Phase B).
- **Auth / permission check** → `new-permission` + `.guard(...)` / `.permission(...)` on routes.
- **WebSocket** — different subsystem entirely; channels have their own guards.
- **Custom behavior Forge's set doesn't provide** — probably not middleware. Reach for extractors, handlers, services, or event listeners first. Escalate only if truly cross-cutting and none of those fit.
