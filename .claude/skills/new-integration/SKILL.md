---
name: new-integration
description: Use when wrapping a third-party HTTP API or SDK into a reusable module under `src/domain/integrations/` — Stripe, Twilio, Mailgun, a KYC provider, an external OAuth provider, etc. Typical phrasings: "integrate Stripe", "add Twilio SMS sending", "wire up a KYC provider", "integrate with a payment gateway", "add a Slack incoming webhook sender", "connect to an external customer-data platform". Covers the directory shape (single-file or folder), config placement in `config/<provider>.toml` + `.env` overrides, typed request/response structs, error mapping, HTTP client selection, retry / rate-limit strategy, webhook receiver pairing (→ `new-route`), and how integrations are called from services / jobs / event listeners. Do NOT use for: Forge-provided primitives (`app.email()?`, `app.hash()?`, `app.database()?`, `app.websocket()?` — these are first-party, not "integrations"); internal cross-service communication; adding a crate dependency without an accompanying third-party integration (that's a Cargo.toml change, escalate if it's a new crate).
---

# New Integration — wrap a third-party API under `src/domain/integrations/`

## When to invoke

A developer needs to call an external service (HTTP API / SDK) from the starter. Typical phrasings:

- "integrate Stripe for payments"
- "add Twilio SMS sending"
- "wire up a KYC provider"
- "integrate with a currency conversion API"
- "add Slack incoming webhook sender"
- "connect to an external customer-data platform"
- "integrate with Mailchimp"

Do NOT invoke for:
- **Forge-provided primitives** — `app.email()?`, `app.hash()?`, `app.database()?`, `app.websocket()?`, `app.jobs()?`, `app.storage()?`. Those are framework-internal, not "integrations". Use them directly from services.
- **Internal cross-service communication** — the starter is a single binary; no microservices to integrate with.
- **Adding a new Rust crate dependency** without an accompanying integration wrapper — CLAUDE.md rule says ask before adding crates. If you need a new dep for an integration, raise it as part of the integration proposal.
- **One-off API call inline in a service** — if the call is truly one-off and won't be repeated / retried / tested, skipping the integrations directory is fine. Most real use cases benefit from a wrapper though.

## Concept

The starter's `src/domain/integrations/` directory exists but is currently empty (just a header comment). Each integration lives as either a single file or a folder under it:

```
src/domain/integrations/
├── mod.rs                          // pub mod declarations
├── stripe.rs                       // single-file integration (small)
├── twilio/
│   ├── mod.rs                      // exposes public API
│   ├── client.rs                   // HTTP client / auth
│   ├── messages.rs                 // per-endpoint typed wrappers
│   └── webhooks.rs                 // inbound webhook payload types
└── kyc/
    ├── mod.rs
    ├── provider_a.rs
    └── provider_b.rs
```

Each integration provides:

1. **A typed public API** — domain-shaped calls like `stripe::create_payment_intent(ctx, &req).await?`, not raw HTTP.
2. **Config source** — `config/<provider>.toml` with dev defaults + `.env` overrides via the double-underscore convention (CLAUDE.md).
3. **Error mapping** — provider errors (HTTP 4xx/5xx, transient failures, rate limits) converted to `forge::Error` with `t!(i18n, "key")` messages where user-visible.
4. **Retry / rate-limit discipline** — either baked in (HTTP client with retry) or deferred to the Job system (integration calls happen inside a job, which has retry/backoff via the Job trait).
5. **Webhook handlers** — if the integration calls back to the starter, a dedicated `POST /webhooks/<provider>` route (via `new-route` with `.public()` + signature verification).

**The starter is the first-of-its-kind**: `src/domain/integrations/mod.rs` currently holds only a comment. This skill codifies the pattern that the first real integration should adopt.

## Prerequisites

- [ ] The provider + specific APIs you need are identified.
- [ ] Auth mechanism (API key / OAuth / mTLS) is known.
- [ ] A test/sandbox environment exists for development.
- [ ] If crates need adding (`reqwest`, provider-specific SDK), **ask the user first** (CLAUDE.md rule) and note the plan in the decision pass.

## Decisions — answer ALL before writing code

### 1. Scope of the integration (v1)

What specific endpoints / operations are needed in v1? Don't wrap the whole provider's API — wrap only what's used now. Extending later is cheap; over-building up front is waste.

### 2. Auth

- **API key** — most common. Stored in `config/<provider>.toml` under `[<provider>] api_key = "..."` with `.env` override `<PROVIDER>__API_KEY=...`. Passed in `Authorization: Bearer <key>` or provider-specific header.
- **OAuth** — complex; includes token refresh. Escalate for the first-ever OAuth integration to confirm the pattern.
- **mTLS** — rare. Stored certificates as file paths in config. Escalate.

### 3. File layout

- **Single file** (`src/domain/integrations/<provider>.rs`) — when v1 has 1–3 operations and fits in ~150 lines.
- **Folder** (`src/domain/integrations/<provider>/`) — when v1 has more operations, or when request/response types grow large. Folder has a `mod.rs` that re-exports the public API.

### 4. HTTP client

- **`reqwest`** — de facto standard for Rust HTTP. Well-known, widely used. **Ask before adding** if it's not already a dep.
- **Provider-specific SDK** — some providers ship official Rust crates. Check first; often thinner wrappers are preferable to official SDKs that bring heavy deps.
- **Forge-provided HTTP client** — Forge may re-export `reqwest` or have its own client. Check `forge::prelude::*` for an HTTP client type before adding.

### 5. Call surface

Design the public API domain-shaped, not endpoint-shaped:

- **Good**: `stripe::create_payment(ctx, user_id, amount_cents).await?` — callers pass domain objects.
- **Bad**: `stripe::post_to_v1_payment_intents(ctx, json!({...})).await?` — callers need to know the provider's URL structure.

### 6. Synchronous vs job-queued

- **Direct from handler** — OK for fast calls (< 500ms) where the user is waiting. Example: address validation during checkout.
- **Dispatched to a Job** — for slow / retryable / background work. Example: sending marketing email via Mailgun. The route enqueues a job; the job calls the integration with Job-level retry semantics.

Most integrations are used both ways depending on the call. Design the integration's public functions to be synchronous; callers decide whether to await or dispatch.

### 7. Webhook direction

- **Outbound only** — starter calls the provider; no inbound. Simpler.
- **Outbound + inbound webhook** — provider calls back (Stripe payment success, Twilio SMS receipt). Requires:
  - A public REST route via `new-route` with `.public()` + HMAC/signature verification before trusting payload.
  - A dedicated `<provider>/webhooks.rs` module with typed payload structs for each event.

### 8. Testing strategy

- **Mocked HTTP** — unit tests with `mockito` / `wiremock` replacing the HTTP boundary. Preferred default.
- **Contract tests** against sandbox — integration tests that hit the provider's sandbox. Slower but catches real changes. `#[ignore]` by default; run on CI nightly.
- **No tests** — only defensible for prototype / single-use integrations.

### 9. Failure handling

- **Retryable failures** (network, 5xx, rate limit) — bubble up as `Error::http(502, ...)` so the Job system can retry, or back off and retry inside the integration.
- **Non-retryable failures** (4xx validation, auth failure) — map to `Error::http(422, t!(i18n, "..."))` for user-facing routes.
- **Provider-specific error codes** — map to translation keys consistently (`integration.<provider>.<code>`).

## Steps

### 1. Add config file

Create `config/<provider>.toml` with dev defaults:

```toml
# config/stripe.toml
# Dev defaults — override in .env for production.
#   STRIPE__API_KEY=sk_live_...
[stripe]
api_key = "sk_test_development_placeholder"
webhook_secret = "whsec_development_placeholder"
base_url = "https://api.stripe.com/v1"
timeout_seconds = 30
```

Document every field with a comment. Mark any secret-ish fields as "override in .env for prod".

### 2. Create the integration module

Single-file layout (`src/domain/integrations/<provider>.rs`):

```rust
//! Thin wrapper around <Provider>. Domain-shaped public API; provider details stay here.
//!
//! Config: `config/<provider>.toml` (+ `.env` overrides).

use forge::prelude::*;
use serde::{Deserialize, Serialize};

// -----------------------------------------------------------------------------
// Config
// -----------------------------------------------------------------------------

#[derive(Deserialize, Clone)]
pub struct <Provider>Config {
    pub api_key: String,
    pub base_url: String,
    #[serde(default = "default_timeout")]
    pub timeout_seconds: u64,
}

fn default_timeout() -> u64 { 30 }

fn load_config(app: &AppContext) -> Result<<Provider>Config> {
    app.config()
        .<provider>()                                // if Forge exposes a typed getter
        .map_err(|_| Error::message("<provider> config missing"))
        .cloned()
}

// -----------------------------------------------------------------------------
// Request / response types
// -----------------------------------------------------------------------------

#[derive(Serialize)]
pub struct Create<Thing>Request {
    pub <field_1>: String,
    pub amount: i64,
}

#[derive(Deserialize)]
pub struct <Thing>Response {
    pub id: String,
    pub status: String,
    // ... only fields the app cares about, not the provider's full payload
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

pub async fn create_<thing>(
    app: &AppContext,
    i18n: &I18n,
    req: &Create<Thing>Request,
) -> Result<<Thing>Response> {
    let cfg = load_config(app)?;
    let client = http_client(&cfg)?;

    let resp = client
        .post(format!("{}/<endpoint>", cfg.base_url))
        .json(req)
        .send()
        .await
        .map_err(|e| Error::http(502, t!(i18n, "integration.<provider>.network_error")))?;

    if !resp.status().is_success() {
        return Err(map_error(resp, i18n).await);
    }

    resp.json::<<Thing>Response>()
        .await
        .map_err(|_| Error::http(502, t!(i18n, "integration.<provider>.parse_error")))
}

// -----------------------------------------------------------------------------
// Internal helpers
// -----------------------------------------------------------------------------

fn http_client(cfg: &<Provider>Config) -> Result<reqwest::Client> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(cfg.timeout_seconds))
        .default_headers({
            let mut headers = reqwest::header::HeaderMap::new();
            headers.insert(
                reqwest::header::AUTHORIZATION,
                format!("Bearer {}", cfg.api_key).parse().unwrap(),
            );
            headers
        })
        .build()
        .map_err(Error::other)
}

async fn map_error(resp: reqwest::Response, i18n: &I18n) -> Error {
    let status = resp.status();
    let body = resp.text().await.unwrap_or_default();
    tracing::warn!("<provider> error: status={status} body={body}");
    if status.is_client_error() {
        Error::http(422, t!(i18n, "integration.<provider>.client_error"))
    } else {
        Error::http(502, t!(i18n, "integration.<provider>.server_error"))
    }
}
```

### 3. Export the module

Edit `src/domain/integrations/mod.rs`:

```rust
// Third-party API integrations (Stripe, Twilio, etc.)
// Each integration gets its own file wrapping the external SDK.

pub mod <provider>;
```

### 4. (If inbound webhooks) Add a webhook route

Invoke the `new-route` skill to add `POST /webhooks/<provider>` with `.public()`. Handler reads the raw body + signature header, verifies HMAC, parses payload, calls into the integration module for processing:

```rust
// src/portals/public/webhook_routes.rs (or wherever your public scope lives)
pub async fn <provider>(
    State(app): State<AppContext>,
    i18n: I18n,
    headers: axum::http::HeaderMap,
    body: String,
) -> Result<impl IntoResponse> {
    crate::domain::integrations::<provider>::verify_and_handle_webhook(
        &app,
        &i18n,
        &headers,
        &body,
    )
    .await?;
    Ok(Json(MessageResponse::new("ok")))
}
```

Implement `verify_and_handle_webhook` inside the integration module — signature verification + typed payload parsing + dispatching whatever work the webhook implies (often: emit a domain event that listeners react to, via `jobs-and-notifications`).

### 5. Add i18n entries for error codes

Edit `locales/en/messages.json`:

```json
{
  "integration": {
    "<provider>": {
      "network_error": "Network error contacting <Provider>.",
      "parse_error": "Unexpected response format from <Provider>.",
      "client_error": "Request rejected by <Provider>.",
      "server_error": "<Provider> is temporarily unavailable."
    }
  }
}
```

Mirror in every locale. CLAUDE.md hard rule.

### 6. Call from services / jobs / handlers

Synchronous from a handler / service (when fast enough):

```rust
// In src/domain/services/checkout_service.rs
pub async fn create_payment(
    app: &AppContext,
    i18n: &I18n,
    user: &User,
    amount: i64,
) -> Result<Payment> {
    let stripe_resp = crate::domain::integrations::stripe::create_payment(
        app,
        i18n,
        &CreatePaymentRequest { user_id: user.id.to_string(), amount },
    )
    .await?;

    // Persist the result as a domain Payment model...
    Ok(payment)
}
```

Dispatched via a Job (when slow / retryable / fire-and-forget):

```rust
// In an event listener
ctx.app().jobs()?.dispatch(SendMarketingEmailJob {
    user_id: event.user_id.clone(),
    template: "welcome".into(),
}).await?;

// SendMarketingEmailJob::handle calls the integration with the Job's retry semantics
```

### 7. Verify

```bash
make check
make lint
```

**If sandboxed testing is set up:**

```bash
# With .env pointed at the provider's sandbox:
PROCESS=cli cargo run -- <your-smoke-command>
```

**Otherwise**, unit tests with mocked HTTP:

```rust
#[tokio::test]
async fn create_thing_parses_response() {
    // Using mockito or wiremock to fake the provider endpoint
}
```

## Don't

- **Don't leak the provider's raw response shape.** The integration's public API returns domain-shaped types. Callers never see raw JSON or provider-specific field names.
- **Don't call the provider from the route handler directly.** Always go through the integration module (in a service or a job). Routes are thin; integrations are reusable.
- **Don't catch errors to ignore them.** If the provider call fails, bubble up — either fail the request or let a Job retry.
- **Don't hardcode the API key.** Always from config + `.env` override. Commit only dev / placeholder values.
- **Don't skip webhook signature verification.** Unsigned webhooks are how attackers impersonate the provider. Every webhook handler verifies HMAC before trusting payload.
- **Don't build a complete SDK on day one.** Wrap only the endpoints v1 needs. Extend as use cases surface.
- **Don't install a new crate without asking.** `reqwest` is a likely requirement; confirm with the user + document in this skill's implementation pass.
- **Don't add the provider's official SDK unless it's strictly better.** Thin typed wrappers around `reqwest` are often preferable to heavy SDKs. Assess before committing.
- **Don't put business logic in the integration module.** The integration knows how to talk to the provider. What to do with the response (record it, trigger side effects, charge credits) is service-layer work.
- **Don't log the API key or full request/response payloads at INFO level.** PII + secrets leak. Use DEBUG for request shapes, mask secrets, and never log the auth header.

## When this skill doesn't fit

- **Forge-provided services** — `app.email()?`, `app.hash()?`, `app.database()?`, `app.websocket()?`, `app.storage()?`, `app.jobs()?`. Call directly.
- **Inline one-off call in a service** — if the call won't be repeated / tested / reused, skip the integrations directory. Most real cases benefit from a wrapper, so this is rare.
- **Changing an existing integration's behavior** — edit the integration module directly; no skill needed for delta edits.
- **Provider with official Rust SDK that's idiomatic** — consider using the SDK directly in a service. Escalate if unsure.
- **OAuth provider integration** — escalate for the first-ever OAuth flow; the pattern has session-management implications.
- **GraphQL / gRPC endpoints** — same shape as REST integrations but with different client. Escalate for the first of its kind.
