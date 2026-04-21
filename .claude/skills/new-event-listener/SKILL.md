---
name: new-event-listener
description: Use when adding a new event listener — a cross-cutting side effect that fires when a domain event or a Forge model lifecycle event (ModelCreated/Updated/Deleted) is emitted. Typical phrasings: "add an event listener for UserRegistered", "listen when a TopUp is saved", "react to X event", "hook into the model lifecycle event bus", "dispatch a job when Y happens", "add a domain event for X". Covers creating a custom Event struct if needed, writing the listener (single-event, multi-event, or container-resolving variants), and registering it via a service provider. Do NOT use for: adding a `write_mutator` to a model field (that's intra-model, part of `new-model`); implementing `ModelLifecycle<M>` (in-transaction multi-field coordination, also `new-model`); registering a WebSocket channel (separate system, see `src/realtime/` and CLAUDE.md "WebSocket" section); or registering a scheduled / cron task (separate concern, not yet skilled).
---

# New Event Listener — hook into a domain or model lifecycle event

## When to invoke

A developer wants a side effect to run when something happens elsewhere in the system. Typical phrasings:

- "add an event listener for UserRegistered"
- "listen when a TopUp is saved and dispatch a notification job"
- "react to `<domain>.<event>` event"
- "hook into the model lifecycle event bus"
- "dispatch a job when X happens"
- "add a new domain event for Y"

Do NOT invoke for:
- **Field-level transformation on save** (hash a password, normalize an email) — that's a `#[forge(write_mutator = "fn")]` on the model, handled by the `new-model` skill.
- **Multi-field coordination within a single model** — that's `impl ModelLifecycle<M>`, covered by `new-model`'s `references/lifecycle-hooks.md`.
- **Registering a WebSocket channel** — different subsystem. See `src/realtime/mod.rs` and CLAUDE.md's "WebSocket" section.
- **Scheduled / cron tasks** — `src/schedules/`; not yet a skill.

## Concept

Events are plain structs that `impl Event` with a `const ID: EventId`. Listeners are structs that `impl EventListener<E>` with an `async fn handle(&self, ctx: &EventContext, event: &E) -> Result<()>`. Registration happens in a service provider (typically `EventServiceProvider`, though feature-owned providers like `BadgeServiceProvider` also register their own listeners) via `registrar.listen_event::<E, _>(Listener)?`.

Forge emits three generic events automatically on every `forge::Model` save/delete: `ModelCreatedEvent`, `ModelUpdatedEvent`, `ModelDeletedEvent` — each carrying a `ModelLifecycleSnapshot` with the table name, before/after records, etc. Use these for cross-cutting reactions over arbitrary models (e.g., the badge system). For business-specific reactions, prefer a custom domain event whose name encodes the semantics (`UserRegistered`, `TopUpApproved`, `InvoicePaid`).

Contrast with `ModelLifecycle<M>`: lifecycle hooks are tightly coupled to one model and run inside the same transaction — right for intra-model invariants. Event listeners are loosely coupled and run cross-cuttingly after emission — right for side effects that touch other systems (jobs, emails, badges, audits).

## Prerequisites

- [ ] The target event exists — either a custom domain event you're also creating in this task, or one of Forge's generic `ModelCreatedEvent` / `ModelUpdatedEvent` / `ModelDeletedEvent` (import from `forge::database`).
- [ ] Any subsystem the listener will call is wired: `jobs` (for `ctx.app().jobs()?.dispatch(...)`), `email` (for `ctx.app().email()?`), `websocket` (for `ctx.app().websocket()?.publish(...)`).

## Decisions — quick (Tier 1, no gate)

1. **Which event(s)?** Single event or multi-event (e.g., the model lifecycle trio for a cross-cutting behavior)?
2. **Listener state?** Stateless unit struct (default) or container-resolving (`ctx.app().resolve::<Thing>()?` on each call)?
3. **What does the listener do?** Dispatch a job, call a service, emit another event, publish WS, send email, write audit row?
4. **Do you need a new Event struct?** Only if Forge's generic model events don't fit the semantics.

## Step A (optional) — Create a custom event

Only if Decision 4 = yes. Skip to Step B if you're listening to an existing event (including the generic model events).

Path: `src/domain/events/<snake>.rs`

```rust
use forge::prelude::*;
use serde::Serialize;

#[derive(Clone, Serialize)]
pub struct <YourEvent> {
    pub <field_1>: String,
    pub <field_2>: <Type>,
}

impl Event for <YourEvent> {
    const ID: EventId = EventId::new("<domain>.<name>");
}
```

Export from `src/domain/events/mod.rs`:

```rust
pub mod <snake>;
```

**Dispatch from the emitter side** — wherever the business action happens (typically a service), call:

```rust
ctx.app().events()?.dispatch(<YourEvent> {
    <field_1>: /* ... */,
    <field_2>: /* ... */,
}).await?;
```

(Confirm the exact API by reading a real dispatch site. If there's no current precedent for custom-event dispatch in the starter, pause and verify against Forge framework docs before wiring the emitter.)

## Step B — Create the listener

Path: `src/domain/events/listeners/<snake>.rs`

Pick the template matching your decisions:

### B-1. Single-event stateless listener (most common)

Pattern from `src/domain/events/listeners/dispatch_welcome_email.rs`.

```rust
use async_trait::async_trait;
use forge::prelude::*;

use crate::domain::events::<your_event>::<YourEvent>;
use crate::domain::jobs::<YourJob>;

pub struct <YourListener>;

#[async_trait]
impl EventListener<<YourEvent>> for <YourListener> {
    async fn handle(&self, ctx: &EventContext, event: &<YourEvent>) -> Result<()> {
        ctx.app()
            .jobs()?
            .dispatch(<YourJob> {
                // fields derived from `event`
            })
            .await?;
        Ok(())
    }
}
```

### B-2. Multi-event listener (one unit struct, many events)

Pattern from `src/domain/badges/mod.rs::BadgeLifecycleListener`. Use when the same logic should respond to a family of events (e.g., all three model-lifecycle events for badges).

```rust
use async_trait::async_trait;
use forge::database::{ModelCreatedEvent, ModelDeletedEvent, ModelUpdatedEvent};
use forge::prelude::*;

pub struct <YourListener>;

#[async_trait]
impl EventListener<ModelCreatedEvent> for <YourListener> {
    async fn handle(&self, ctx: &EventContext, event: &ModelCreatedEvent) -> Result<()> {
        handle_change(ctx, &event.snapshot.table).await
    }
}

#[async_trait]
impl EventListener<ModelUpdatedEvent> for <YourListener> {
    async fn handle(&self, ctx: &EventContext, event: &ModelUpdatedEvent) -> Result<()> {
        handle_change(ctx, &event.snapshot.table).await
    }
}

#[async_trait]
impl EventListener<ModelDeletedEvent> for <YourListener> {
    async fn handle(&self, ctx: &EventContext, event: &ModelDeletedEvent) -> Result<()> {
        handle_change(ctx, &event.snapshot.table).await
    }
}

async fn handle_change(ctx: &EventContext, table: &str) -> Result<()> {
    // shared logic; ctx.app() gives access to container, db, jobs, websocket, etc.
    Ok(())
}
```

Important: `ModelCreatedEvent` and friends are **not** re-exported from `forge::prelude`. Import them explicitly from `forge::database`.

### B-3. Container-resolving listener (stateless struct, resolves state per call)

Use when the listener needs access to app-managed state (a registry, a dispatcher, a cache) that must be consistent across invocations. Store the state in the DI container at provider time; resolve it per event. Pattern from the badge system.

```rust
use async_trait::async_trait;
use forge::database::ModelCreatedEvent;
use forge::prelude::*;

use crate::domain::<your_feature>::<YourRegistry>;

pub struct <YourListener>;

#[async_trait]
impl EventListener<ModelCreatedEvent> for <YourListener> {
    async fn handle(&self, ctx: &EventContext, event: &ModelCreatedEvent) -> Result<()> {
        let registry = ctx.app().resolve::<<YourRegistry>>()?;
        // use registry...
        Ok(())
    }
}
```

Do NOT put mutable state on the listener struct directly — listeners are cloned / re-used by the framework, and mutations leak between invocations.

## Step C — Export the listener module

Edit `src/domain/events/listeners/mod.rs`:

```rust
pub mod <snake>;
```

## Step D — Register with a service provider

Edit `src/providers/event_service_provider.rs` (for general cross-cutting listeners) OR a feature-owned provider (like `badge_service_provider.rs` — feature-specific listeners can live next to their feature's registry / dispatcher).

```rust
use crate::domain::events::listeners::<snake>::<YourListener>;

registrar.listen_event::<<YourEvent>, _>(<YourListener>)?;
```

For multi-event listeners: one `listen_event` call per event type, passing the same unit struct each time:

```rust
registrar.listen_event::<ModelCreatedEvent, _>(<YourListener>)?;
registrar.listen_event::<ModelUpdatedEvent, _>(<YourListener>)?;
registrar.listen_event::<ModelDeletedEvent, _>(<YourListener>)?;
```

(Pattern confirmed at `src/providers/badge_service_provider.rs`.)

## Verify

```bash
make check
make lint
```

Both must pass. The listener is now wired into the event bus.

**Optional smoke test** — trigger the event:
- For custom events: dispatch it from a service / CLI / test.
- For `ModelCreatedEvent`: save a row of the watched type.

Then confirm the side effect (log line, job enqueued, DB row written, WS message received, email queued). If nothing happens, check Step D — a listener that compiles but isn't registered silently never fires.

## Don't

- **Don't put mutable state on the listener struct.** If state is needed, resolve it from `ctx.app()` per call. Forge's container gives consistent state.
- **Don't block the listener with heavy work.** Dispatch a job (`ctx.app().jobs()?.dispatch(...)`) for long-running tasks. Listeners should complete in milliseconds — the event bus may run them inline.
- **Don't use an event listener for intra-model transformation.** Use `write_mutator` for field transforms, `ModelLifecycle<M>` for multi-field coordination. Both are handled by the `new-model` skill.
- **Don't under-specify event fields.** The event struct is the contract. If a listener needs data the event doesn't carry, update the event struct (rare) rather than re-querying from the listener.
- **Don't use `ModelCreatedEvent` + "filter by table" when a domain-specific event exists.** Prefer the typed domain event. Generic model events are for truly cross-cutting reactions (badges, audit trails).
- **Don't forget the registrar call.** A listener that's compiled but not registered never fires — no error, no warning.
- **Don't double-register.** Two `listen_event` calls for the same `(EventType, ListenerType)` pair = listener fires twice.
- **Don't use stringly-typed event IDs beyond the `const ID: EventId = EventId::new("domain.name")` declaration.** All consumers should reference the event type, not its string ID.
- **Don't install new dependencies** without asking (CLAUDE.md global rule).

## When this skill doesn't fit

- **Field-level save-time transformation** → `new-model` skill (`write_mutator`).
- **Multi-field coordination inside one model** → `new-model` → `references/lifecycle-hooks.md`.
- **Cron / scheduled task** → separate concern; see `src/schedules/`. Not yet a skill.
- **Publishing a WebSocket message to clients** — possible combinations:
  - Pair with `admin-badge` system's dispatcher pattern (debounce + broker fan-out).
  - Or publish directly from a listener via `ctx.app().websocket()?.publish(channel, event, room, payload).await?`.
