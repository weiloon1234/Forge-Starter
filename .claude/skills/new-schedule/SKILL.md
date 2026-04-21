---
name: new-schedule
description: Use when adding a recurring / cron-driven task — code that runs on an interval or at specific times, independent of any user request. Typical phrasings: "prune expired tokens nightly", "daily rollup report at 02:00", "heartbeat every five minutes", "weekly cleanup of orphaned uploads", "hourly sync with external service", "expire old notifications once a day", "cron job to retry stuck jobs". Covers the `ScheduleRegistry` fluent API (`every_minute`, `every_five_minutes`, `hourly`, `daily`, `daily_at`, `weekly`, `cron`), the `ScheduleId` constant in `src/ids/schedules.rs`, registration in `src/schedules/mod.rs`, and when a schedule should dispatch a job vs. do the work inline. Do NOT use for: on-demand CLI work (→ `new-cli-command` — schedules run unattended on wall-clock, CLI runs on human invocation); reactive work on model save / domain event (→ `new-event-listener` + `jobs-and-notifications`); one-shot delayed execution (→ `app.jobs()?.dispatch_later(job, when_ms)` covered by `jobs-and-notifications`); long-running server processes (those are kernels, not schedules).
---

# New Schedule — add a recurring task

## When to invoke

A developer needs code that runs on a timer, independent of any HTTP request or user action. Typical phrasings:

- "prune expired tokens every night"
- "daily rollup report at 02:00"
- "heartbeat every 5 minutes"
- "weekly cleanup of orphaned uploads"
- "hourly sync with Stripe"
- "expire old notifications once a day"
- "cron task to retry stuck jobs"

Do NOT invoke for:
- **On-demand CLI operations** — `new-cli-command`. CLI commands run when a human / CI triggers them. Schedules run unattended on wall-clock.
- **Reactive side effects on model save / domain event** — `new-event-listener` for the trigger + `jobs-and-notifications` for the work.
- **One-shot delayed execution** (send an email 24h after signup) — `app.jobs()?.dispatch_later(job, timestamp_ms)`. Not a schedule; it's a job scheduled to a specific future moment.
- **Long-running server processes** — HTTP / Worker / Scheduler / WebSocket kernels. A schedule exits when its closure returns.

## Concept

Forge's Scheduler runs as a dedicated process (`PROCESS=scheduler cargo run`, started automatically by `make dev`). It consults a registry of scheduled tasks and fires each one at its configured interval. Each task is a closure `|inv| async move { ... }` registered via the `ScheduleRegistry` fluent API.

Registration path:

```
bootstrap/scheduler.rs (or app.rs)
  → AppBuilder::register_schedules(schedules::register)
  → src/schedules/mod.rs::register(registry)
  → registry.daily(ScheduleId, |inv| async move { ... })?;
       / every_minute / every_five_minutes / hourly / weekly / cron / ...
```

The starter's `src/schedules/mod.rs` already has a working example:

```rust
pub fn register(registry: &mut ScheduleRegistry) -> Result<()> {
    registry.daily(ids::schedules::PRUNE_EXPIRED_TOKENS, |inv| async move {
        inv.app().tokens()?.prune(30).await?;
        Ok(())
    })?;
    Ok(())
}
```

`inv` gives `inv.app()` (full `AppContext`) — everything the HTTP kernel has: database, email, jobs, notifications, services.

**Key insight — schedules often dispatch jobs rather than do work inline.** The schedule's only job is "trigger at 02:00"; the work (with retry / backoff / queueing) belongs in a Job. This composition keeps the schedule surface tiny and leverages the Job system's resilience.

## Prerequisites

- [ ] The work is genuinely periodic (not event-driven, not on-demand).
- [ ] The schedule cadence is decided (which helper method — every 5 min, hourly, daily at 02:00, etc.).
- [ ] If the work is slow / retryable, a corresponding Job exists (or is being added via `jobs-and-notifications`).

## Decisions — quick

### 1. Cadence

Forge's built-in helpers, in order of frequency:

| Method | When it fires |
|---|---|
| `every_minute(id, fn)` | Every minute |
| `every_five_minutes(id, fn)` | Every 5 min |
| `every_ten_minutes(id, fn)` | Every 10 min |
| `every_fifteen_minutes(id, fn)` | Every 15 min |
| `every_thirty_minutes(id, fn)` | Every 30 min |
| `hourly(id, fn)` | Every hour at :00 |
| `daily(id, fn)` | Every day at 00:00 |
| `daily_at(id, "HH:MM", fn)` | Every day at that wall-clock time |
| `weekly(id, fn)` | Weekly |
| `cron(id, "<expr>", fn)` | Full cron expression for anything else |

Use the named helper when one fits (clearer reading). Only drop to `cron` for patterns they don't cover.

### 2. Inline vs dispatch-to-job

- **Inline** — the work is fast (< 1 second typically), idempotent, and doesn't need retry beyond the next scheduled tick. Example: `inv.app().tokens()?.prune(30).await?` (already in the starter).
- **Dispatch a Job** — the work is slow, has external dependencies (third-party API), can fail transiently, or should benefit from the Job system's retry / backoff / rate-limit / unique-for machinery.

Most non-trivial schedules end up dispatching a job. The schedule is the trigger; the job is the work.

### 3. Timezone

Forge schedules fire at **UTC** by default. If business hours matter, convert in the closure or encode the offset in the cron expression. Most daily-rollup kinds of work are fine at midnight UTC.

### 4. Unique-per-deployment vs global

Schedules run on the scheduler process. If you deploy multiple scheduler instances (rare — usually one per environment), Forge's leadership / locking needs to prevent duplicate firing. The starter is single-scheduler by default; don't assume multi-instance without reviewing Forge's docs.

## Steps

### 1. Add the `ScheduleId` constant

Edit `src/ids/schedules.rs`:

```rust
use forge::prelude::*;

pub const PRUNE_EXPIRED_TOKENS: ScheduleId = ScheduleId::new("prune_expired_tokens");
pub const <YOUR_SCHEDULE>: ScheduleId = ScheduleId::new("<snake_name>");   // ← new
```

Match existing style: `UPPER_SNAKE_CASE` const name + snake_case string key.

### 2. Register the schedule

Edit `src/schedules/mod.rs`. Add inside the `register` function:

```rust
use crate::ids;
use forge::prelude::*;

pub fn register(registry: &mut ScheduleRegistry) -> Result<()> {
    registry.daily(ids::schedules::PRUNE_EXPIRED_TOKENS, |inv| async move {
        inv.app().tokens()?.prune(30).await?;
        Ok(())
    })?;

    // New:
    registry.<cadence>(ids::schedules::<YOUR_SCHEDULE>, |inv| async move {
        // Inline work OR dispatch a job — see patterns below.
        Ok(())
    })?;

    Ok(())
}
```

Closures are async; access `inv.app()` for everything.

### 3. Choose pattern — inline vs dispatch

**Inline (fast, simple, non-retryable):**

```rust
registry.hourly(ids::schedules::<YOUR_SCHEDULE>, |inv| async move {
    let db = inv.app().database()?;
    <Model>::model_query()
        .where_(<Model>::EXPIRES_AT.lt(DateTime::now()))
        .delete()
        .execute(db.as_ref())
        .await?;
    Ok(())
})?;
```

**Dispatch to a Job (slow, retryable, external deps):**

```rust
registry.daily_at(ids::schedules::<YOUR_SCHEDULE>, "02:00", |inv| async move {
    inv.app()
        .jobs()?
        .dispatch(crate::domain::jobs::<YourJob> {
            // payload fields
        })
        .await?;
    Ok(())
})?;
```

The dispatch pattern is usually right when the work involves external services, large datasets, or anything that might fail transiently. The schedule fires quickly (just enqueues); the Job runs on the worker with full retry semantics.

### 4. (If dispatching) Create the Job

Use `jobs-and-notifications` to scaffold + wire the job. Keep the job's payload minimal — the scheduler fires on wall-clock, so the job shouldn't need external state beyond what the schedule snapshots into its payload.

### 5. Verify

```bash
make check
make lint
```

**Smoke test**:

```bash
make dev
```

Watch the scheduler process logs. The schedule fires on its cadence; at the configured moment you should see either the inline work's effect (row deleted, count updated) or the job enqueue log from the dispatcher.

For schedules that fire infrequently (daily, weekly), consider temporarily changing to `every_minute` during development to confirm the logic works, then revert before committing. Don't leave dev-cadence in the committed code.

## Common patterns

### Prune expired records

```rust
registry.daily(ids::schedules::PRUNE_OLD_AUDIT_LOGS, |inv| async move {
    let db = inv.app().database()?;
    let cutoff = DateTime::now() - chrono::Duration::days(90);
    AuditLog::model_query()
        .where_(AuditLog::CREATED_AT.lt(cutoff))
        .delete()
        .execute(db.as_ref())
        .await?;
    Ok(())
})?;
```

### Hourly external sync (dispatch to job)

```rust
registry.hourly(ids::schedules::SYNC_STRIPE, |inv| async move {
    inv.app()
        .jobs()?
        .dispatch(SyncStripeJob {})
        .await?;
    Ok(())
})?;
```

The `SyncStripeJob` handles the actual HTTP calls with retry / backoff per the Job trait.

### Daily report at fixed time

```rust
registry.daily_at(ids::schedules::DAILY_REVENUE_REPORT, "02:00", |inv| async move {
    inv.app()
        .jobs()?
        .dispatch(GenerateDailyReportJob {
            date: DateTime::now().date_naive().to_string(),
        })
        .await?;
    Ok(())
})?;
```

### Cron expression for complex patterns

```rust
registry.cron(ids::schedules::WEEKDAY_MORNING_SUMMARY, "0 8 * * 1-5", |inv| async move {
    // Every weekday at 08:00 UTC
    inv.app().jobs()?.dispatch(SendWeekdaySummary {}).await?;
    Ok(())
})?;
```

Standard 5-field cron: minute, hour, day-of-month, month, day-of-week.

### Multi-step schedule (read config, decide, dispatch)

```rust
registry.daily_at(ids::schedules::DAILY_SETTLEMENT, "03:00", |inv| async move {
    let app = inv.app();
    let settings = crate::domain::services::settings_service::load_settlement_config(app).await?;
    if !settings.enabled {
        return Ok(());
    }
    app.jobs()?.dispatch(SettleAccountsJob { /* ... */ }).await?;
    Ok(())
})?;
```

## Testing

Schedules are **hard to test directly** because they fire on wall-clock. Two strategies:

1. **Extract the work into a function, test the function.** The schedule closure is one-line: `some_work(inv.app()).await?`. Write tests for `some_work`. This is the pattern all real schedules should follow — closures should be tiny.

2. **Schedule + Job split + test the Job.** When the schedule only dispatches a Job, the schedule is trivially "enqueue job X". Test the Job's `handle` as described in `jobs-and-notifications`. The schedule itself doesn't need testing beyond "does it compile + register without panic".

Don't try to test the scheduler's timing — that's Forge's concern, not yours.

## Don't

- **Don't do slow work inline in the closure.** The scheduler is sequential; a slow schedule can delay the next one. Dispatch a job for anything that might block.
- **Don't couple schedules to the HTTP / worker lifetime.** Schedules run in the scheduler process; they should be self-contained and not assume anything else is warm.
- **Don't duplicate JobId and ScheduleId values.** They're separate namespaces, but keep them visually distinct — `PRUNE_EXPIRED_TOKENS` (schedule) may dispatch `PruneExpiredTokensJob` (job), and each has its own typed ID.
- **Don't forget the registration.** A file that declares a schedule but isn't referenced in `src/schedules/mod.rs::register` never fires.
- **Don't use `every_minute` for anything that could run faster than "once a minute" is worth." — too chatty. Prefer longer intervals or trigger-based execution via events.
- **Don't pack logic the scheduler doesn't need.** The closure runs on every tick; minimize allocations / work. Ideally: resolve context → dispatch job → return.
- **Don't write schedule closures that assume idempotency comes for free.** If the scheduler ever fires twice (deployment restart, leadership churn), the work must either be safe to run twice OR the closure must check "did this already run?" in the DB. Jobs solve this via `unique_for()`; inline schedule logic does not.
- **Don't use timezone math inside the closure without being explicit.** Forge fires at UTC. If business hours matter, encode the offset in the cron expression or the helper call — don't rely on runtime tz inspection that might drift.
- **Don't leave dev-only short cadences committed.** If you tuned `every_minute` during development, revert to the real cadence before committing.

## When this skill doesn't fit

- **On-demand operations** — `new-cli-command`. Manual trigger, not wall-clock.
- **Event-driven side effects** — `new-event-listener` + `jobs-and-notifications`.
- **One-shot delayed work** — `app.jobs()?.dispatch_later(job, run_at_millis)` from within a service. Not periodic; just a future firing.
- **Immediate background work** — regular `app.jobs()?.dispatch(job)` from the originating handler.
- **Long-running foreground** — that's a kernel (HTTP / Worker / WebSocket), not a schedule.
- **Cross-process coordination / leader election** — escalate; Forge owns the scheduler process design.
