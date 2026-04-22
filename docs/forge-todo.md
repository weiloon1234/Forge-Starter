# Forge Framework — Production Readiness Additions

**Audience:** the Forge framework agent.
**Author:** the Forge-Starter agent.
**Purpose:** a prioritized, concrete implementation plan for framework-level additions that production-grade starter projects need. The Forge-Starter project is on hold until these land.

## Context

The Forge-Starter uses Forge as a Laravel-inspired Rust web framework + React multi-portal scaffold. An audit of the starter against "is it safe to deploy to real users?" surfaced a set of gaps. Most are project-level (CI, backups, frontend tests), but the items in this document are ones that **must live in the framework** because:

- they require hooking framework internals (event context, panic handler, token validation path),
- or they are generic enough that every project would otherwise reimplement them,
- or the framework already owns the adjacent surface and the addition is a natural extension.

Each ask includes problem, proposed API, implementation location, acceptance criteria, and estimated effort. Where Forge already ships something adjacent, the ask describes the **delta** only.

## Pinned revision

Forge is consumed at revision `7b79eb5a2870976eae88e8bc6fcf2dd1fb94645e` (branch `main`).
Source root referenced throughout: `src/`.

## Already in place (no work needed — listed for disambiguation)

The following were considered "framework asks" during the audit but already ship in `7b79eb5`:

| Item | Where | Status |
|---|---|---|
| Liveness probe | `GET /_forge/health` | ✅ complete |
| Readiness probe with extensible checks | `GET /_forge/ready` + `ReadinessRegistryBuilder::register_arc` | ✅ complete |
| Prometheus metrics | `GET /_forge/metrics` (text/plain; version=0.0.4) in `src/logging/observability.rs` + `src/logging/metrics.rs` | ✅ complete |
| Token revocation on logout | PAT-backed, `revoked_at IS NULL` checked on validate, `TokenManager::revoke(...)` / `revoke_all::<M>(actor_id)` in `src/auth/token.rs:279-303` | ✅ complete |
| Rate-limit by actor / by actor-or-ip | `RateLimit::by_actor()` / `by_actor_or_ip()` in `src/http/middleware.rs:699-787` | ✅ complete |
| `Error` type with i18n message key | `Error::http_with_metadata(status, msg, code, key)` in `src/foundation/error.rs:11-38` | ✅ complete |
| Full test harness (no TCP) | `forge::testing::TestApp` / `TestClient` / `Factory` in `src/testing/{mod,client,factory}.rs` | ✅ complete — starter is not using it yet; that's a starter-side migration, not a framework ask |

These are called out so the Forge agent can skip them and so any starter code that redundantly implements them can be removed after the remaining asks land.

## Asks — prioritized

The table below is the summary; each ask is detailed in its own section below. Sequencing rationale: items that are short + high-leverage first, so the starter can unblock fastest.

| # | Ask | Effort | Blast radius | Priority |
|---|---|---|---|---|
| 1 | Test database `DROP SCHEMA` safety guard | ~0.5 day | Prevents footgun in `forge::testing` | 🔴 do first |
| 2 | Model lifecycle event context — actor + request origin | ~2 days | Unblocks audit logs in every project | 🔴 do first |
| 3 | Error reporter trait + hook points (panic / handler / job) | ~1.5 days | Generic Sentry-style plugin point | 🔴 |
| 4 | Login lockout — per-identifier failure tracker | ~1.5 days | Complements existing RateLimit with account-level lockout | 🔴 |
| 5 | MFA (TOTP baseline, WebAuthn feature-flag) | ~4-5 days | Core auth infrastructure | 🟠 |
| 6 | Job dead-lettered hook (`JobMiddleware::on_dead_lettered`) | ~0.5 day | Error-tracker integration for jobs | 🟡 |

Total estimated effort: ~10–11 days.

---

## Ask 1 — Test database `DROP SCHEMA` safety guard

### Problem

`forge::testing::TestApp` bootstraps the whole framework with the full DB. Integration tests that exercise migrations typically `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` at the start of each run. The framework does not guard against this being pointed at a production or shared-dev database — `cargo test` with a carelessly-configured `.env` silently wipes real data.

No file or type named `TestDatabaseGuard`, `TestDbGuard`, or similar exists in `src/testing/`.

### Proposed API

Two layers:

**Layer A — framework-level automatic guard** (opt-out only, not opt-in):

```rust
// src/testing/guard.rs  (new file)
pub fn assert_safe_to_wipe(db_url: &str) -> Result<(), Error> { /* panics-or-error */ }
```

Called internally by any `TestApp` helper that mutates schema. Rules:

1. If `FORGE_ALLOW_TEST_DB_WIPE=1` is set, allow unconditionally (explicit opt-out for advanced cases).
2. Otherwise, parse the URL's database name:
    - If it matches `^test_` or `_test$` or `^forge_test`, allow.
    - Otherwise, return an `Error` with a clear message explaining what to set.

**Layer B — explicit helper for tests that manage their own schema**:

```rust
// src/testing/mod.rs  (re-export)
pub use guard::assert_safe_to_wipe;
```

So tests that drop schema outside of `TestApp` (the Forge-Starter's current integration tests do this) can call `forge::testing::assert_safe_to_wipe(&db_url)?` before their first destructive call.

### Implementation notes

- Add `src/testing/guard.rs` with the single function above.
- Wire it into any `TestApp` fn that performs destructive schema operations. The survey indicates `TestApp::builder().build()` does not by default drop the schema, so the principal consumer is the explicit helper call.
- Zero runtime cost in production (`#[cfg(any(test, feature = "testing"))]` gate if testing is feature-gated; otherwise the helper is just a plain function that real production code does not call).
- **Non-breaking.** This is additive.

### Acceptance

- `forge::testing::assert_safe_to_wipe("postgres://user@localhost/myapp")` returns `Err`.
- `forge::testing::assert_safe_to_wipe("postgres://user@localhost/myapp_test")` returns `Ok(())`.
- `FORGE_ALLOW_TEST_DB_WIPE=1 forge::testing::assert_safe_to_wipe("postgres://user@localhost/myapp")` returns `Ok(())`.
- A unit test in `src/testing/guard.rs` covers all three cases and the edge where the URL has no database segment.

### Effort

~0.5 day.

---

## Ask 2 — Model lifecycle event context: actor + request origin

### Problem

Starters that want an audit log write one row per model mutation keyed on **who** did it and **from where**. The natural place to emit these is the `ModelCreated/Updated/Deleted<M>Event` bus; the natural consumer is an `EventListener`.

Today that doesn't work cleanly:

- `src/events/mod.rs:19-31` — `EventContext` only has `app: AppContext`. No actor, no IP, no user-agent.
- `src/database/model.rs:913-965` — `ModelHookContext<'a>` has `actor() -> Option<&crate::auth::Actor>` but lives at the **hook level** (in-transaction, same call frame). It does NOT propagate to event listeners.
- Events fire via `dispatch()` at `src/database/query.rs:3304, 3397, 3486, 3584` — the dispatch site has access to `ModelHookContext` but the `Event` struct the listener eventually receives carries only a snapshot, not the originating context.

Net effect: a listener that wants to write `audit_logs { admin_id, ip, user_agent, action, before, after }` can see `before`/`after` from the snapshot but has NO way to see `admin_id`, `ip`, or `user_agent`. Projects are forced to stuff this into thread-locals or abandon the listener pattern.

### Proposed API

**Enrich `EventContext` to optionally carry origin metadata:**

```rust
// src/events/mod.rs
pub struct EventContext {
    app: AppContext,
    origin: Option<EventOrigin>,   // new
}

pub struct EventOrigin {
    pub actor: Option<Actor>,       // owned, not borrowed (listeners are async + 'static)
    pub ip: Option<IpAddr>,
    pub user_agent: Option<String>,
    pub request_id: Option<String>, // reuses RequestId middleware value
}

impl EventContext {
    pub fn origin(&self) -> Option<&EventOrigin> { self.origin.as_ref() }
    pub fn actor(&self) -> Option<&Actor> { self.origin.as_ref().and_then(|o| o.actor.as_ref()) }
}
```

**Thread the origin through the model-write call sites.** The four lifecycle-event fire sites (`create`, `create in transaction`, `update`, `delete`) take `ModelHookContext`; that context needs an `origin` field too, populated from:

- the `actor` already known (in-transaction),
- an `Option<RequestExtensions>` propagated from the HTTP handler down through `with_model_write_transaction` (line 3156).

**Expose the origin to HTTP handlers as a first-class extractor:**

```rust
// Already present implicitly; make it explicit + public.
// src/http/extractors.rs  (new or existing)
#[derive(Clone)]
pub struct CurrentRequest { pub ip: Option<IpAddr>, pub user_agent: Option<String>, pub request_id: Option<String> }

// Automatically attached by an internal middleware (hook into existing RequestId pipeline at src/logging/middleware.rs:12-81).
```

The handler's `AuthenticatedModel<M>` extractor already gives the actor; combining the two gives the full origin. Forge should provide a convenience:

```rust
// Helper that a handler can construct and pass into service layer.
pub fn origin_for_request(actor: Option<&Actor>, req: &CurrentRequest) -> EventOrigin { ... }
```

And more importantly, **automatic propagation**: when a handler is invoked, the framework installs the current `(actor, CurrentRequest)` into a task-local (`tokio::task_local!`) that `with_model_write_transaction` reads when building the `ModelHookContext`. Projects then write **zero** plumbing code — every `Model::save(...)` inside a handler automatically carries origin into its lifecycle events.

### Implementation notes

- Task-local installation happens in the auth + RequestId middleware stack (priority 0, outermost practical layer after `TrustedProxy`). The existing `src/logging/middleware.rs` already injects `RequestId` as an extension — extend it to populate a task-local.
- `with_model_write_transaction` (`src/database/query.rs:3156`) reads the task-local when present, attaches to `ModelHookContext`, propagates into the dispatched event's `EventContext`.
- Non-HTTP paths (CLI, scheduler, jobs) have no task-local set → `origin` is `None`, which is correct — CLI / scheduler mutations are legitimately "no human actor".
- Jobs specifically: when a job is enqueued from an HTTP handler and wants to carry the enqueuer's origin, the job payload must opt in (add `origin: Option<EventOrigin>` to job metadata). First-pass: jobs inherit `None`; later enhancement.
- `Actor` must be `Clone` for this to work owned — verify in `src/auth/mod.rs`. If not, add `#[derive(Clone)]` or wrap in `Arc`.

### Acceptance

- An `EventListener<ModelUpdatedEvent<User>>` registered in a project can read `ctx.actor()` and get the admin that triggered the mutation via an HTTP handler.
- An `EventListener<ModelCreatedEvent<Foo>>` triggered by a scheduled task's mutation sees `ctx.origin()` is `None`.
- Integration test in `forge/tests/` exercises both cases.
- Non-breaking: projects that don't use `ctx.origin()` see no behavior change.

### Effort

~2 days. The wiring through `ModelHookContext` → `EventContext` is the bulk; task-local installation is straightforward.

---

## Ask 3 — Error reporter trait + hook points

### Problem

When a handler errors, a job dies, or a panic occurs, there is no framework-level hook to forward the incident to Sentry / Honeybadger / Rollbar. Projects currently have to manually sprinkle `capture_exception` calls — which means many error paths go unreported.

- `src/foundation/error.rs:11-38` — `Error` has no post-conversion observer.
- `src/http/mod.rs` — no "on error response" middleware concept.
- `src/jobs/mod.rs:830-857` — dead-lettering logs via `tracing` but does not call any external hook.
- No custom `std::panic::set_hook` installation.

### Proposed API

A single reporter trait with three call sites the framework owns:

```rust
// src/logging/reporter.rs  (new)
#[async_trait]
pub trait ErrorReporter: Send + Sync + 'static {
    /// Called when a handler returns an error response (status >= 500 by default; configurable).
    async fn report_handler_error(&self, report: HandlerErrorReport);

    /// Called from the panic hook.
    async fn report_panic(&self, report: PanicReport);

    /// Called when a job has exhausted retries.
    async fn report_job_dead_lettered(&self, report: JobDeadLetteredReport);
}

pub struct HandlerErrorReport {
    pub method: String,
    pub path: String,
    pub status: u16,
    pub error: String,            // Error::Display
    pub chain: Vec<String>,       // source chain
    pub origin: Option<EventOrigin>,  // from Ask 2
    pub request_id: Option<String>,
}

pub struct PanicReport {
    pub message: String,
    pub location: String,
    pub backtrace: Option<String>,
    pub context: PanicContext,    // { Http { request_id, method, path }, Job { id, class }, Scheduler { id }, Other }
}

pub struct JobDeadLetteredReport {
    pub job_class: String,
    pub job_id: String,
    pub attempts: u32,
    pub last_error: String,
    pub payload: serde_json::Value,
}
```

Registration:

```rust
AppBuilder::new()
    .register_error_reporter::<MyReporter>()            // type-based, uses Default
    .register_error_reporter_instance(Arc::new(r))      // explicit instance
```

The framework stores reporters in a `Vec<Arc<dyn ErrorReporter>>` on `AppContext` so multiple reporters can fan out (primary Sentry + secondary log sink, for example).

### Implementation notes

- New module `src/logging/reporter.rs`; re-export key types from `src/logging/mod.rs`.
- `AppBuilder` gains `register_error_reporter*` methods (pattern mirrors `register_validation_rule` at `src/foundation/app.rs`).
- HTTP fan-out: wrap the existing error-to-response conversion path in the HTTP kernel. Likely `src/kernel/http.rs` or `src/http/response.rs` — whichever converts `Error` → `Response`. Configurable threshold (default: `status >= 500`; allow `status >= 400` for the debug mode).
- Panic fan-out: `AppBuilder::build_http_kernel` installs a `std::panic::set_hook` that reads task-locals (request_id, job_id, etc. set by the respective middleware/worker) and calls all registered reporters. Wrap in `PANIC_HOOK_INSTALLED: OnceCell<()>` to be idempotent.
- Job fan-out: the dead-letter path at `src/jobs/mod.rs:830-857` calls reporters immediately after the `record_job_outcome(DeadLettered)` call.
- **Ship a first-party `forge-sentry` crate** (in-repo, separate package) that implements `ErrorReporter` via `sentry` crate. Optional feature.

### Acceptance

- A handler returning `Err(Error::message("boom"))` invokes every registered reporter's `report_handler_error` exactly once.
- `panic!("oops")` inside a handler invokes every reporter's `report_panic` with `context: PanicContext::Http { ... }`.
- A job that fails all retries invokes every reporter's `report_job_dead_lettered`.
- Integration test using a stub reporter verifies the three paths.
- `forge-sentry` crate demo: add the dependency, call `.register_error_reporter_instance(forge_sentry::reporter(dsn))`, verify events show up in a local Sentry mock.

### Effort

~1.5 days for the trait + hooks; `forge-sentry` crate another ~0.5 day.

---

## Ask 4 — Login lockout: per-identifier failure tracker

### Problem

`RateLimit::by_actor_or_ip` (`src/http/middleware.rs:699-787`) prevents an attacker from hammering one IP, but a credential-stuffing attacker rotating through a botnet can still make many attempts against one victim account. The framework should provide **per-identifier failure tracking with lockout** — distinct from generic rate-limiting.

Current state:

- No `lockout`, `failed_attempts`, `throttle` module found in search.
- `RateLimit` is request-count-based; lockout is failure-count-based (successful logins reset the counter).

### Proposed API

A small auth-side module that projects invoke from their login handler:

```rust
// src/auth/lockout.rs  (new)
pub struct LoginThrottle {
    store: Arc<dyn LockoutStore>,            // Redis default, in-memory fallback
    max_failures: u32,                        // default 5
    lockout_duration: Duration,               // default 15 minutes
    window: Duration,                         // failure counter TTL, default 15 minutes
}

impl LoginThrottle {
    pub fn new(app: &AppContext) -> Self { /* reads config/auth.toml [auth.lockout] */ }

    /// Before checking password. Returns Err if currently locked out.
    pub async fn before_attempt(&self, identifier: &str) -> Result<(), LockoutError>;

    /// After a FAILED password check. Increments counter, may lock the account.
    pub async fn record_failure(&self, identifier: &str) -> Result<(), Error>;

    /// After a SUCCESSFUL login. Clears the counter.
    pub async fn record_success(&self, identifier: &str) -> Result<(), Error>;
}

pub enum LockoutError {
    LockedOut { until: DateTime<Utc> },   // maps to 429 with Retry-After
}

#[async_trait]
pub trait LockoutStore: Send + Sync + 'static { /* get/set/incr/clear */ }
```

Identifiers are opaque strings — projects decide whether to key on `username`, `email`, `(username, tenant_id)`, etc. Typical use:

```rust
// In the project's login handler.
let throttle = LoginThrottle::new(&app);
throttle.before_attempt(&req.username).await?;

match auth::verify_password(&req.username, &req.password).await {
    Ok(user) => {
        throttle.record_success(&req.username).await?;
        issue_token(user).await
    }
    Err(_) => {
        throttle.record_failure(&req.username).await?;
        Err(Error::http_with_code(401, "Invalid credentials", "invalid_credentials"))
    }
}
```

Config:

```toml
# config/auth.toml
[auth.lockout]
enabled = true
max_failures = 5
lockout_minutes = 15
window_minutes = 15
store = "redis"  # or "memory"
```

### Implementation notes

- Redis store via existing Redis client (`AppContext::redis()?`).
- Keys: `forge:lockout:{identifier_sha256}` → counter integer with TTL.
- On lock: key's value becomes a sentinel (e.g., `"LOCKED:{unix_ts_until}"`).
- In-memory store for CI / tests where Redis is not present.
- **Not wired into middleware** — projects invoke explicitly from their login handler. This is deliberate: coupling lockout to a specific route path requires framework knowledge of "what is a login route", which is project-owned.
- Emits events on lockout: `LoginLockedOutEvent { identifier, locked_until }` so projects can listen and write to their audit log.

### Acceptance

- Unit tests: 4 failures in a window, 5th throws; after lockout window, counter clears.
- Integration test: mock login handler + `LoginThrottle` behaves correctly for the three paths.
- Works with both Redis and in-memory stores.
- Lockout emits the event; project can register a listener.

### Effort

~1.5 days.

---

## Ask 5 — Multi-factor authentication (TOTP baseline)

### Problem

No MFA of any kind in `src/auth/`. Every starter that needs MFA (realistically: every production-bound starter) has to implement it.

### Proposed API

A TOTP-first module with a pluggable backend for future WebAuthn:

```rust
// src/auth/mfa/mod.rs  (new)
#[async_trait]
pub trait MfaFactor: Send + Sync + 'static {
    async fn enroll(&self, actor: &Actor) -> Result<EnrollChallenge>;      // e.g., TOTP QR
    async fn confirm(&self, actor: &Actor, response: &str) -> Result<()>;  // first valid code
    async fn verify(&self, actor: &Actor, response: &str) -> Result<()>;   // subsequent logins
    fn id(&self) -> &str;                                                  // "totp", "webauthn"
}

// src/auth/mfa/totp.rs
pub struct TotpFactor { /* … */ }
impl MfaFactor for TotpFactor { /* uses `totp-rs` or hand-rolled RFC 6238 */ }
```

Data requirements (projects add via migration, Forge provides helper):

```rust
// Forge-provided migration helper.
forge::auth::mfa::migrations::add_mfa_columns_to::<Admin>(m);
// Adds: mfa_totp_secret (nullable), mfa_totp_confirmed_at (nullable),
//       mfa_recovery_codes_hashed (JSON array of argon2 hashes, nullable)
```

Framework hooks:

```rust
// Guard-level requirement.
config/auth.toml:
[auth.guards.admin]
require_mfa_for_admin_types = ["developer", "super_admin"]

// Token issuance differentiates pre-MFA and post-MFA tokens.
// TokenManager::issue_pre_mfa(actor) → short-lived token scoped to mfa endpoints only
// TokenManager::issue(actor) → full token, only callable after MFA verified
```

HTTP:

```rust
// Framework provides these route handlers; projects wire them into their scope:
forge::auth::mfa::routes::enroll    // POST /auth/mfa/enroll  → EnrollChallenge (QR URL)
forge::auth::mfa::routes::confirm   // POST /auth/mfa/confirm → () on first valid code
forge::auth::mfa::routes::verify    // POST /auth/mfa/verify  → TokenPair (full access)
forge::auth::mfa::routes::disable   // POST /auth/mfa/disable → requires current TOTP
forge::auth::mfa::routes::recovery  // POST /auth/mfa/recovery-codes → regenerate
```

WebAuthn deferred behind a feature flag — Forge ships the `MfaFactor` trait + TOTP impl; WebAuthn can arrive as a future factor without breaking changes.

### Implementation notes

- Use `totp-rs` crate for RFC 6238. Recovery codes stored as Argon2 hashes (reuse `src/foundation/hash.rs` if it exists, otherwise add).
- Pre-MFA token: extend `TokenManager` to mint scoped tokens with a claim list (`["mfa:verify"]` only). Validation at MFA routes accepts pre-MFA scope; all other routes reject it.
- Event hooks: `MfaEnrolledEvent`, `MfaDisabledEvent`, `MfaVerifiedEvent`, `MfaFailedEvent` — for audit log.
- Integrates with Ask 4: MFA failures increment lockout counter under a distinct key (`lockout:mfa:{identifier}`).

### Acceptance

- Admin with `developer` type cannot obtain a full token without MFA verification.
- TOTP setup flow: enroll → show secret → confirm with first code → confirmed.
- Recovery codes work one-time each.
- Disable requires current TOTP (not just password).
- Integration tests cover all four state transitions.

### Effort

~4–5 days. Most is test coverage + edge cases (time-skew, replay prevention within the 30s window, clock drift).

---

## Ask 6 — Job dead-lettered hook

### Problem

Subsumed by Ask 3's `ErrorReporter::report_job_dead_lettered`, but called out separately because the hook may be wanted by non-error-reporting consumers too (e.g., metrics sinks, Slack pagers).

### Proposed API

A thin job middleware:

```rust
// src/jobs/middleware.rs  (new)
#[async_trait]
pub trait JobMiddleware: Send + Sync + 'static {
    async fn on_dead_lettered(&self, ctx: &JobDeadLetterContext) { let _ = ctx; }
    async fn on_succeeded(&self, ctx: &JobCompletionContext) { let _ = ctx; }  // future
    async fn on_retry(&self, ctx: &JobRetryContext) { let _ = ctx; }           // future
}

pub struct JobDeadLetterContext {
    pub class: String,
    pub id: String,
    pub attempts: u32,
    pub last_error: String,
    pub payload: serde_json::Value,
    pub app: AppContext,
}
```

Registration via `AppBuilder::register_job_middleware(m)`. `ErrorReporter` from Ask 3 is built on top of this (framework-level auto-wiring).

### Implementation notes

- Hook into `src/jobs/mod.rs:830-857` dead-letter path.
- Only `on_dead_lettered` is in scope for this ask; the other variants are marked as reserved so the trait is stable.

### Acceptance

- A registered `JobMiddleware` sees `on_dead_lettered` fired exactly once per dead-lettered job.
- Multiple middlewares are called in registration order.
- Hook failures do not abort the dead-letter path (caught + logged).

### Effort

~0.5 day, can ship alongside Ask 3.

---

## Sequencing recommendation

Dependencies:

- Ask 2 (event context) blocks clean audit-log impls at the project level → do early.
- Ask 1 (DB guard) is independent → do first (fastest).
- Ask 3 (error reporter) depends partially on Ask 2 (to enrich `HandlerErrorReport.origin`) → do after Ask 2.
- Ask 4 (lockout) is independent.
- Ask 5 (MFA) depends on Ask 4 (lockout reuses the store).
- Ask 6 (job middleware) ships with Ask 3.

Suggested order:

1. **Week 1:** Ask 1 → Ask 2 → Ask 3 + 6 together.
2. **Week 2:** Ask 4 → Ask 5.

Total: ~2 calendar weeks with focused effort.

## Non-goals (explicitly out of scope)

- **OpenTelemetry export.** Existing Prometheus endpoint covers the SLO dashboard case. OTEL is a future ask.
- **Distributed tracing across services.** Same.
- **Built-in captcha / hCaptcha / reCAPTCHA.** Too opinionated; leave to projects.
- **SMS MFA.** TOTP covers 95% of the threat model; SMS MFA is widely deprecated and leaves SIM-swap vectors open. WebAuthn is the right second factor for a future ask.
- **Session fixation mitigation beyond what PAT tokens already give.** PAT model is resistant by design.
- **HIPAA / PCI-DSS / SOC2 mapping.** Out of scope for the framework; each project maps for its regulator.

## Questions for the Forge agent

Please answer before starting so I can update the starter accordingly:

1. **Task-local vs extension**: Ask 2 proposes `tokio::task_local!` for origin propagation. Is this compatible with the existing spawn patterns in `src/jobs/mod.rs` and `src/kernel/scheduler.rs`? If `tokio::task_local` doesn't survive `tokio::spawn` into job workers (it doesn't, by default — need explicit scope), what's the idiomatic Forge workaround?
2. **`Actor` clonability**: is `Actor` currently `Clone`? Ask 2 needs owned `Actor` in `EventOrigin`. If not cloneable, should I propose `Arc<Actor>` instead?
3. **`forge-sentry` crate placement**: does Forge want this in the same workspace or as a separate repo? If same workspace, which `Cargo.toml` section should it live under?
4. **Config schema**: all asks introduce new config sections. Preference for a single new `[auth.lockout]` + `[auth.mfa]` + `[logging.reporters]` split, or consolidated under `[security]`?
5. **Error-reporter thresholds**: should the default "report handler errors ≥ 500" be configurable per-reporter (so one reporter sees 400s and another only 500s), or globally?
6. **Event origin for job-enqueued-from-handler**: is it acceptable to ship Ask 2 with jobs inheriting `origin: None` in v1, and add an opt-in payload field in a follow-up? Or is day-1 propagation to jobs expected?

## Coordination

After this lands:

- The Forge-Starter project will migrate its `tests/*.rs` integration tests from the curl-subprocess pattern to `forge::testing::TestApp` + `TestClient`.
- Ask 1's guard will be called from any surviving destructive-schema path in the starter.
- An audit-log model + listener will be added to the starter using Ask 2's enriched context (one of the starter's existing skills, `new-model` + `new-event-listener`, will be sequenced by a new `audit-log` skill that assumes Ask 2 is available).
- A first-party `forge-sentry` integration will be wired into the starter's bootstrap as documented in Ask 3.
- Login handlers in `src/portals/admin/auth_routes.rs` and `src/portals/user/auth_routes.rs` will invoke `LoginThrottle` from Ask 4.
- Admin login flow will add MFA verification from Ask 5.

No starter-side work begins until all six asks are merged into Forge `main`.

## Revision history

- 2026-04-22 — initial forwarding plan authored by Forge-Starter agent against Forge revision `7b79eb5`.
