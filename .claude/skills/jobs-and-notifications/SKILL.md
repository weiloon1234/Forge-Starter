---
name: jobs-and-notifications
description: Use when dispatching asynchronous work OR delivering user-facing notifications. Typical phrasings: "add a job to do X in the background", "send an email to user after Y", "queue a CSV export job", "notify user when their order ships", "welcome email on signup", "multi-channel notification (email + in-app + push)", "retry a failing webhook delivery", "in-app notification inbox for users". Forge provides both systems — Jobs (bare async work with retry/backoff/rate-limit) and Notifications (multi-channel delivery with a recipient + `Notifiable` trait). Notifications dispatch via the Job queue under the hood but carry recipient identity and per-channel rendering. Do NOT use for: recurring scheduled tasks (→ `src/schedules/`, not yet a skill); cross-cutting side-effects on model save (→ `new-event-listener` for the trigger, which dispatches the job/notification); WebSocket channels for real-time data (→ CLAUDE.md "WebSocket" + `admin-badge` for counts); badge count updates (→ `admin-badge`).
---

# Jobs and Notifications — async work + multi-channel delivery

## When to invoke

A developer needs to defer work off the request path OR deliver a message to a user / admin / other actor. Typical phrasings:

- "send welcome email on signup"
- "queue a CSV export"
- "notify user when their order ships"
- "password reset email with code"
- "retry-safe webhook delivery"
- "resize uploaded image in the background"
- "in-app notification inbox with unread count"
- "admin alert when payment fails"
- "nightly cleanup task" — **no**, that's `src/schedules/` (scheduler), not jobs

Do NOT invoke for:
- **Cron / scheduled tasks** — `src/schedules/` handles recurring work; Jobs are one-shot (or retry).
- **The event trigger itself** — `new-event-listener` wires model-save / domain events to handlers. The handler *dispatches* a job/notification; this skill covers what's dispatched, not the trigger.
- **Real-time data pushes to connected clients** — WebSocket channels handle that (`admin-badge` for counts; CLAUDE.md "WebSocket" section for raw channels).
- **Frontend toasts / banners** — `toast.success(...)` in a React handler, not a notification.
- **Backend-to-backend queues between microservices** — not a concept in this single-binary starter.

## Concept

Two distinct Forge subsystems, related but not interchangeable:

**Job** — a serializable unit of async work. Has an `ID`, a `handle(ctx)` method, rich retry / backoff / timeout / rate-limit / uniqueness controls. No concept of "recipient". Runs on the worker process (`PROCESS=worker`). Examples: resize image, send a bare email, call a third-party API, generate a report.

**Notification** — an outbound message to a recipient, delivered across one or more **channels** (email / database / WebSocket broadcast / custom). A `Notification` struct declares the channels it uses via `fn via()` and renders the payload per-channel via `to_email()` / `to_database()` / `to_broadcast()`. The recipient implements `Notifiable` (gives back its ID + per-channel routing like email address). Under the hood, dispatching a notification builds a `SendNotificationJob` and submits it to the Job queue — but you never interact with that internal job directly.

**The crucial difference:** Jobs do work. Notifications inform a specific actor. When in doubt: "is there a recipient whose identity + channel preferences matter?" → Notification. "Is this just work that needs to happen?" → Job.

**The three built-in channels** (Forge ships them all registered):
- `NOTIFY_EMAIL` — via `app.email()?.send(message)`.
- `NOTIFY_DATABASE` — writes a row to the `notifications` table (schema already exists per `database/migrations/000000000003_create_notifications.rs`). Enables an in-app inbox UX.
- `NOTIFY_BROADCAST` — publishes to the WebSocket channel `notifications:{notifiable_id}` with event `notification` — enables real-time inbox delivery.

Custom channels (SMS, Slack, Discord, push) are added via `registrar.register_notification_channel(id, channel)` — rare; escalate for first real need.

**Dispatch modes:**
- `forge::notifications::notify(&app, &recipient, &notification).await?` — **synchronous**; awaits all channels in order; use only when you need delivery completion before responding (e.g., compliance flow). Inline execution.
- `forge::notifications::notify_queued(&app, &recipient, &notification).await?` — **default**; pre-renders payloads, queues one `SendNotificationJob`, returns immediately. Non-blocking for the caller.

## Decisions — answer ALL before writing code

### 1. Job vs Notification vs neither

| Question | Answer |
|---|---|
| Is there a specific human / actor being informed? | → **Notification** |
| Does delivery need to potentially span multiple channels (email + in-app + push) now OR later? | → **Notification** |
| Do you want per-user opt-out / channel preferences eventually? | → **Notification** |
| Is it just background work with no recipient concept? | → **Job** |
| Is it a one-off email to a hardcoded address (e.g., ops@company.com) with no user identity? | → **Job** (a single-channel Notification is overkill) |
| Needs custom retry / backoff / rate-limit / uniqueness semantics? | → **Job** (Notifications inherit defaults from `SendNotificationJob`) |
| Runs on a cron schedule? | → Neither — use `src/schedules/` (scheduler), which may internally dispatch a Job |
| Triggered on a model save / domain event? | → `new-event-listener` for the trigger; it then dispatches the job/notification defined here |

### 2. For a Job

- **Recipient address source?** — free-form: payload fields, DB lookup inside `handle`, config constant.
- **Retry policy?** — default (5 retries with exponential backoff) is usually fine. Override for:
  - Webhook deliveries → `rate_limit()` + longer `backoff`
  - High-volume non-critical work → lower `max_retries` + shorter timeout
  - Critical work → higher `max_retries` + alert on final failure
- **Idempotency?** — if dispatching the same job twice within a window should be a no-op (e.g., "send reminder"), set `unique_for()` and `unique_key()`.
- **Queue?** — default queue is fine unless you're segmenting (e.g., high-priority vs batch). `const QUEUE: Option<QueueId>` on the Job.
- **Timeout?** — default 300s. Override for long-running jobs via `fn timeout()`.

### 3. For a Notification

- **Which channels in v1?** — `NOTIFY_EMAIL`, `NOTIFY_DATABASE`, `NOTIFY_BROADCAST`, or a combination. Start with the minimum set; add channels incrementally.
- **Recipient type?** — User, Admin, or another `Notifiable`-implementing model. If the target type doesn't impl `Notifiable` yet, this skill's Step C handles it — once per actor type, not per notification.
- **`notification_type` string?** — follow the dotted-namespace convention: `"user.welcome"`, `"order.shipped"`, `"admin.payment_failed"`. Stored in the `notifications.type` column; used for filtering / counting.
- **Sync or queued dispatch?** — queued (default). Use sync only when the caller needs delivery guaranteed before responding.
- **Inbox UX?** — if `NOTIFY_DATABASE` is in `via()`, the user should eventually be able to view the inbox. Add that UX as a separate follow-up (not in this skill's scope; becomes an `admin-page` or `user-page` task).

## Core steps

### Part A — Adding a Job

#### A.1. Add the JobId constant

Edit `src/ids/jobs.rs`:

```rust
use forge::prelude::*;

pub const SEND_WELCOME_EMAIL: JobId = JobId::new("send_welcome_email");
pub const <YOUR_JOB>: JobId = JobId::new("<snake_name>");   // ← new
```

Keep the convention: `UPPER_SNAKE_CASE` const name matching the job struct's snake_case equivalent.

#### A.2. Create the job module

Generate the scaffold via the CLI — never hand-create the file:

```bash
PROCESS=cli cargo run -- make:job --name <YourJob>
```

This creates `src/domain/jobs/<snake>.rs` with the `impl Job` skeleton + export wiring. Then edit the file to match the template below:

```rust
use async_trait::async_trait;
use forge::prelude::*;
use serde::{Deserialize, Serialize};

use crate::ids::jobs::<YOUR_JOB>;

#[derive(Debug, Serialize, Deserialize)]
pub struct <YourJob> {
    pub <field_1>: String,
    pub <field_2>: u64,
    // ... all fields needed to run — must round-trip through serde
}

#[async_trait]
impl Job for <YourJob> {
    const ID: JobId = <YOUR_JOB>;

    // Optional overrides — delete any you don't need:
    // fn max_retries(&self) -> Option<u32> { Some(5) }
    // fn timeout(&self) -> Option<std::time::Duration> { Some(std::time::Duration::from_secs(60)) }
    // fn rate_limit(&self) -> Option<(u32, std::time::Duration)> {
    //     Some((100, std::time::Duration::from_secs(60)))
    // }
    // fn unique_for(&self) -> Option<std::time::Duration> {
    //     Some(std::time::Duration::from_secs(30))
    // }
    // fn unique_key(&self) -> Option<String> {
    //     Some(format!("<namespace>:{}", self.<field_1>))
    // }

    async fn handle(&self, ctx: JobContext) -> Result<()> {
        // Business logic. ctx.app() gives you:
        //   ctx.app().database()?  → DatabaseManager (for SQL / model queries)
        //   ctx.app().email()?     → EmailManager (for sending mail directly)
        //   ctx.app().jobs()?      → JobDispatcher (chain further jobs)
        //   ctx.app().websocket()? → WebSocketPublisher
        //   ctx.app().hash()?      → password hasher
        //   ctx.app().resolve::<T>()? → any bound singleton
        //
        // ctx.attempt() returns the current attempt number (1-indexed).
        Ok(())
    }
}
```

Export in `src/domain/jobs/mod.rs`:

```rust
pub mod <snake>;
pub use <snake>::<YourJob>;
```

#### A.3. Register the job

Edit `src/providers/app_service_provider.rs` — add inside `register`:

```rust
registrar.register_job::<<YourJob>>()?;
```

Without this call, dispatch fails at runtime ("job type not registered").

#### A.4. Dispatch

From any service, event listener, or route handler that holds an `AppContext`:

```rust
// Default — dispatch now, worker picks up asap
ctx.app().jobs()?.dispatch(<YourJob> {
    <field_1>: "...".to_string(),
    <field_2>: 42,
}).await?;

// Scheduled for later (epoch millis)
let run_at_ms = (Utc::now() + Duration::hours(1)).timestamp_millis();
ctx.app().jobs()?.dispatch_later(<YourJob> { ... }, run_at_ms).await?;
```

#### A.5. Verify

```bash
make check
make lint
```

**Smoke test:**
1. `make dev` (starts HTTP + worker + scheduler + WS).
2. Trigger the dispatch site (API call, fixture, CLI command).
3. Watch the worker process logs — the job should pick up + run.
4. If it errors, confirm retry behavior matches your `backoff()` + `max_retries()`.

### Part B — Adding a Notification

#### B.1. (One-time per actor) Implement `Notifiable` on the recipient model

If the target model already implements `Notifiable`, skip this step. The starter's `User` and `Admin` models **do not yet** impl `Notifiable` — the first notification landing adds it.

Edit `src/domain/models/user.rs` (or admin.rs, or whichever actor):

```rust
use forge::notifications::Notifiable;

impl Notifiable for User {
    fn notification_id(&self) -> String {
        self.id.to_string()
    }

    fn route_notification_for(&self, channel: &str) -> Option<String> {
        match channel {
            "email" => self.email.clone(),              // Option<String> — unwraps implicitly
            // "sms" => self.contact_number.clone(),    // enable when SMS channel is registered
            _ => None,
        }
    }
}
```

`notification_id()` is the `notifiable_id` stored in the `notifications.notifiable_id` column + broadcast WS channel name. Use the model's primary key.

`route_notification_for(channel)` returns the delivery address. For email: the email string. For database: not called (channel uses `notifiable_id`). For broadcast: not called (channel uses `notifiable_id`). For custom channels: whatever that channel needs (phone for SMS, Slack ID for Slack).

#### B.2. Create the notification module

Create the directory + file: `src/domain/notifications/<snake>.rs` (create `src/domain/notifications/mod.rs` the first time).

```rust
// src/domain/notifications/welcome.rs
use forge::email::EmailMessage;
use forge::notifications::{Notifiable, Notification, NotificationChannelId, NOTIFY_DATABASE, NOTIFY_EMAIL};
use serde_json::json;

pub struct Welcome {
    pub user_name: String,
}

impl Notification for Welcome {
    fn notification_type(&self) -> &str {
        "user.welcome"
    }

    fn via(&self) -> Vec<NotificationChannelId> {
        vec![NOTIFY_EMAIL, NOTIFY_DATABASE]
    }

    fn to_email(&self, notifiable: &dyn Notifiable) -> Option<EmailMessage> {
        let recipient = notifiable.route_notification_for("email")?;
        Some(
            EmailMessage::new("Welcome to <Your App>!")
                .to(recipient.as_str())
                .text_body(&format!(
                    "Hi {}, thanks for signing up. We're glad to have you.",
                    self.user_name
                )),
        )
    }

    fn to_database(&self) -> Option<serde_json::Value> {
        Some(json!({
            "title": "Welcome!",
            "body": format!("Hi {}, thanks for signing up.", self.user_name),
        }))
    }

    // Optional: enable real-time in-app push
    // fn to_broadcast(&self) -> Option<serde_json::Value> {
    //     Some(json!({
    //         "type": self.notification_type(),
    //         "title": "Welcome!",
    //     }))
    // }
}
```

**Conventions:**
- `notification_type()` follows `"<domain>.<event>"` — stored in DB, greppable, stable across versions. Treat as a contract.
- `via()` lists the channel constants: `NOTIFY_EMAIL`, `NOTIFY_DATABASE`, `NOTIFY_BROADCAST`, or a custom `NotificationChannelId::new("your_channel")`.
- `to_email()` returns `None` if the recipient has no email routing; Forge skips that channel gracefully.
- `to_database()` returns JSON that lands in `notifications.data` (JSONB column). Frontend reads this for inbox display.
- `to_broadcast()` returns JSON pushed over WS to `notifications:{notifiable_id}`.

Export in `src/domain/notifications/mod.rs`:

```rust
pub mod welcome;
pub use welcome::Welcome;
```

And add `pub mod notifications;` to `src/domain/mod.rs` if this is the first notification.

#### B.3. Dispatch

From wherever the event happens (event listener, service, handler):

```rust
use forge::notifications::notify_queued;

use crate::domain::models::User;
use crate::domain::notifications::Welcome;

// In a service or event listener with access to AppContext:
let user: User = /* fetched or received */;

notify_queued(
    ctx.app(),
    &user,
    &Welcome { user_name: user.name.clone().unwrap_or_default() },
).await?;
```

Use `notify(...)` instead of `notify_queued(...)` **only** when you need delivery to complete before the function returns (rare — e.g., compliance flows, integration tests asserting immediate side effects).

#### B.4. Verify

```bash
make check
make lint
```

**Smoke test** (with `make dev` running):

1. Trigger the dispatch site.
2. Check worker logs — `SendNotificationJob` should pick up and process each channel.
3. **Email**: check the configured email backend (dev: usually stdout or local capture).
4. **Database**: `psql` → `SELECT type, data, read_at FROM notifications WHERE notifiable_id = '<user_id>';` — the row exists with your JSON.
5. **Broadcast**: if your frontend subscribes to `notifications:{user_id}`, the payload arrives in real time.

## Existing starter patterns

- **`src/domain/jobs/send_welcome_email.rs`** — canonical bare-Job example. Dispatched by the `DispatchWelcomeEmail` event listener on `UserRegistered`. Good reference for Job structure.
- **No existing Notification** — this skill's first real use adds the first one. Consider whether to migrate `SendWelcomeEmail` to a `Welcome` notification at that point: the upgrade gains multi-channel readiness + database inbox + per-user opt-out surface. It's a judgment call; don't rush if single-channel email is all you'll ever need.

## Retry / backoff / timeout guidance

| Job kind | `max_retries` | `backoff` default | `timeout` | `rate_limit` |
|---|---|---|---|---|
| User-facing email (welcome, password reset) | 3–5 | default | default (300s) | none |
| Webhook delivery to third-party | 10+ | longer exponential | 30s | `(100, 60s)` per endpoint |
| Image processing | 2 | shorter | 120s | none |
| Data export (large) | 1 | n/a | 1800s (30 min) | none |
| Analytics ping (non-critical) | 0 | n/a | 5s | none |

Notifications use `SendNotificationJob`'s defaults. If a specific notification needs custom retry semantics, that's a signal to dispatch a bare Job instead.

## Frontend inbox UX (optional, downstream)

If the notification uses `NOTIFY_DATABASE`, users can have an in-app inbox. Scope for a **separate follow-up** (invokes `admin-page` or `user-page` skill for the UI, not this skill):

- `GET /api/v1/<portal>/notifications?unread=true&per_page=20` — paginated list
- `PUT /api/v1/<portal>/notifications/{id}/read` — mark one
- `PUT /api/v1/<portal>/notifications/read-all` — mark all
- Unread count → could become an `admin-badge` (`work.notifications_unread`) by counting `WHERE read_at IS NULL` on the `notifications` table scoped to the admin.

Broadcast channel integration — frontend subscribes to `notifications:{user_id}` and increments local unread count on receive, or refetches the inbox.

This inbox feature is **not part of the notification skill itself**. Document it here as the expected downstream UX so the first real notification work can route to the right follow-up skill.

## Testing

**Jobs** — for jobs with meaningful retry logic, an integration test asserting the retry count is valuable. Follow the pattern in `tests/user_baseline.rs`:

```rust
#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires local PostgreSQL and Redis services with the starter config"]
async fn job_retries_on_failure() -> Result<()> {
    // Seed, boot_api, dispatch a job whose handle deliberately fails N times,
    // then succeeds. Assert worker log / DB state reflects the attempts.
    Ok(())
}
```

**Notifications** — dispatch via `notify(&app, &user, &notification)` (sync mode) in a test so the assertion is deterministic:

```rust
#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires local PostgreSQL, Redis, and email test sink"]
async fn welcome_notification_delivers_email_and_database() -> Result<()> {
    let (app, _addr) = boot_api().await?;
    let user: User = /* create */;
    forge::notifications::notify(&app, &user, &Welcome { user_name: user.name.clone().unwrap() }).await?;

    // Query notifications table
    let rows = app.database()?
        .raw_query(
            "SELECT type, data FROM notifications WHERE notifiable_id = $1",
            &[DbValue::Text(user.id.to_string())],
        )
        .await?;
    assert_eq!(rows.len(), 1);
    // Assert email sink received the message (depends on email backend).
    Ok(())
}
```

## Don't

- **Don't dispatch a Job for a "tell user X about Y" case.** Use a Notification — you lose multi-channel readiness, per-user routing, inbox storage, and the standard convention otherwise.
- **Don't dispatch a Notification for bare background work.** Use a Job — you pay for recipient routing that doesn't apply.
- **Don't put business logic in the handler that belongs in a service.** `handle()` calls services; it doesn't re-implement them. Same rule as route handlers (CLAUDE.md "Portals are THIN" extended to workers).
- **Don't forget `registrar.register_job::<J>()?`.** A job that's compiled + dispatched but not registered fails at worker pickup with a clear error — but it's a waste of a debugging cycle.
- **Don't forget to `impl Notifiable`** on the target model once. First notification adds it; subsequent notifications reuse.
- **Don't pass non-`Serialize`-safe types in the Job payload.** The payload round-trips through serde for the queue. `Arc<...>`, closures, raw handles — all fail.
- **Don't hand-create job files.** Use `PROCESS=cli cargo run -- make:job --name <YourJob>` to scaffold the file with correct naming + mod.rs wiring. Edit the generated shell.
- **Don't dispatch synchronously (`notify()`) by default.** It blocks the caller for the duration of all channels' send times. Use `notify_queued()` unless you have a specific reason for sync delivery.
- **Don't use the Notification system for a single-recipient ops email** (e.g., "alert ops@company.com when payment fails"). That's a bare Job — the Notification layer adds no value for non-user targets.
- **Don't hand-write a `SendNotificationJob`.** That's Forge's internal job used by `notify_queued`. You always call `notify` / `notify_queued`; never construct the internal job.
- **Don't skip i18n on the user-visible text.** Email subject/body and `to_database` payload fields that will render in the inbox MUST use `t!(i18n, "key")` when user-visible. Dispatch the notification with the locale baked into the payload, OR look up the user's locale inside `to_email` / `to_database`.
- **Don't install a new email / SMS / push crate** without asking. Use Forge's `app.email()?` and channel registration surface; escalate if a new channel is needed.

## When this skill doesn't fit

- **Recurring / cron work** → `new-schedule`. Scheduled tasks may internally dispatch a Job; the schedule is the trigger, the Job is the retryable work.
- **The trigger** (model save, domain event, WS message received) → `new-event-listener`. The listener dispatches the Job/Notification defined here.
- **Real-time data push without per-recipient delivery** (e.g., "broadcast a price change to all connected clients") → WebSocket channel (CLAUDE.md "WebSocket" + `admin-badge` pattern), not a notification.
- **Frontend toast / banner** — `toast.success(...)` from `sonner`; not a notification.
- **Single-recipient ops alert without user concept** — bare Job with hardcoded email; Notification's `Notifiable` overhead isn't earned.
- **Adding a custom notification channel** (SMS, Slack, push) — rare first-time work; escalate + extend this skill with the custom-channel pattern when the first real use lands.
- **Adding an in-app inbox UI** — `admin-page` (or `user-page` when that exists) + the DB channel's existing rows. Not this skill's scope.
