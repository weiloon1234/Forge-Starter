# Admin Badge System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Git note:** The repository owner manages all git operations. Do NOT run `git commit`, `git push`, or `git merge`. The "Pause for review" steps describe the intended commit boundary — pause and let the owner commit. Skip the step if running in a sandbox.

**Goal:** Build the admin-portal badge-count infrastructure: a one-file-per-badge Rust trait, a Redis-backed WebSocket broadcast path driven by Forge model events, a REST snapshot endpoint, and a shared React store + sidebar integration. v1 ships infrastructure only; no real business badge is registered.

**Architecture:** `impl AdminBadge` structs register themselves in a `BadgeRegistry`. Forge's built-in `ModelCreatedEvent`/`ModelUpdatedEvent`/`ModelDeletedEvent` bus feeds a `BadgeLifecycleListener` that enqueues recomputes per watched-table. A `BadgeDispatcher` debounces (250 ms per key), recomputes, and publishes `{ key, count }` to a single shared channel `admin:badges` via `app.websocket()?.publish(...)`. Admin frontend hydrates its `badgeStore` from `GET /api/v1/admin/badges` on auth, subscribes once to `admin:badges`, and filters incoming deltas with an allowlist derived from the snapshot. Sidebar renders badges per menu item; parents sum visible children's counts.

**Tech Stack:** Rust + Forge (model lifecycle events, WebSocket publisher, service providers), Axum routes, React 19 + `useSyncExternalStore`-based shared store, existing `@shared/websocket` client.

**Spec:** `docs/superpowers/specs/2026-04-21-admin-badge-system-design.md`

**Research findings used by this plan (Task 1 verified):**
- `AppContext::websocket() -> Result<Arc<WebSocketPublisher>>` — exists, Redis-backed, cross-process-safe. Note: returns `Arc<WebSocketPublisher>`, not `&WebSocketPublisher`.
- `WebSocketPublisher::publish<C, E>(channel: C, event: E, room: Option<&str>, payload: impl Serialize) -> Result<()>` — async.
- `ModelCreatedEvent`, `ModelUpdatedEvent`, `ModelDeletedEvent` fire automatically on every `forge::Model` save/delete. `impl Event` with `const ID: EventId = EventId::new("model.created")` etc. Payload: `ModelLifecycleSnapshot { model: String, table: String, primary_key_column: String, before: Option<DbRecord>, after: Option<DbRecord>, pending: Option<DbRecord> }`. Import via `forge::prelude::*` or `forge::database::{...}`.
- `forge::Model` trait has **no compile-time `TABLE` const**. Instead: `fn table_meta() -> &'static TableMeta<Self>` — call `<T as forge::Model>::table_meta().name()` at registration time when `T` is a concrete type.
- Container API: `Container::singleton<T>(value)`, `singleton_arc<T>(Arc<T>)`, `factory<T, F>(F)`, `factory_arc<T, F>(F)`, `resolve<T>() -> Result<Arc<T>>`. `ServiceRegistrar` wraps the container — Task 5 verifies which of these are re-exposed on the registrar vs. needing `registrar.container()` indirection.
- `ModelLifecycle<M>` trait also exists (per-model sync hooks), but the event-bus path is cleaner for cross-cutting listeners and is what this plan uses.

---

## File Map

**Backend — create:**
- `src/domain/badges/mod.rs` — `AdminBadge` trait, `BadgeRegistry`, `BadgeDispatcher`, `BadgeLifecycleListener`
- `src/domain/badges/dev_dummy.rs` — `DevDummyBadge` (smoke-test only, feature-gated)
- `src/domain/services/badge_service.rs` — portal-less `current_counts(ctx, admin)`
- `src/providers/badge_service_provider.rs` — registration provider
- `src/portals/admin/badge_routes.rs` — thin REST handler (`index`)
- `tests/admin_badges.rs` — integration test for REST + WS + lifecycle

**Backend — modify:**
- `src/domain/mod.rs` — `pub mod badges;`
- `src/domain/services/mod.rs` — `pub mod badge_service;`
- `src/providers/mod.rs` — export `BadgeServiceProvider`
- `src/portals/admin/mod.rs` — register `badge_routes::index`, add module declaration, import `BadgeCountsResponse`
- `src/portals/admin/responses.rs` — add `BadgeCountsResponse`
- `src/ids/channels.rs` — add `ADMIN_BADGES: ChannelId`, `BADGE_UPDATED: ChannelEventId`
- `src/realtime/mod.rs` — register `admin:badges` channel with `Guard::Admin`
- `src/bootstrap/http.rs` — register `BadgeServiceProvider`
- `src/bootstrap/websocket.rs` — register `BadgeServiceProvider`

**Frontend — create:**
- `frontend/admin/src/stores/badgeStore.ts` — `adminBadges` + `useBadge` + `useBadgeSum`
- `frontend/admin/src/components/sidebar/Badge.tsx` — pill component
- `frontend/admin/src/components/sidebar/getBadgeCount.ts` — aggregation helper

**Frontend — modify:**
- `frontend/admin/src/config/side-menu.ts` — rename `notification?: string` → `badge?: string`
- `frontend/admin/src/App.tsx` — hydrate + subscribe + reset on auth change
- `frontend/admin/src/components/Sidebar.tsx` — use aggregation helper + render badge

---

## Task 1: Verify Forge API surface + Model table-name access

**Files:** none modified — this task is investigation only.

- [ ] **Step 1: Confirm `AppContext::websocket()` exact signature**

Open `~/.cargo/git/checkouts/forge-a710e404260b9608/7b79eb5/src/foundation/app.rs` around lines 118–120 and `src/websocket/mod.rs` around lines 179–250. Record the exact method name and return type. Expected: `pub fn websocket(&self) -> Result<&WebSocketPublisher>` or similar.

- [ ] **Step 2: Confirm `ModelCreatedEvent` / `ModelUpdatedEvent` / `ModelDeletedEvent` constants and payload**

Open `~/.cargo/git/checkouts/forge-a710e404260b9608/7b79eb5/src/database/model.rs` around lines 893–911. Record:
- The struct name and `const ID: EventId` value for each of the three events.
- The exact field names on `ModelLifecycleSnapshot` (we need `table: String`).
- Which module path to import them from in app code (likely `forge::prelude::*` or `forge::database::*`).

- [ ] **Step 3: Determine how to get a model's table name at compile time**

Check whether `forge::Model` (or the `#[derive(forge::Model)]` expansion) exposes an associated `const TABLE: &'static str` or similar. Grep the forge source:

```bash
grep -rn "const TABLE" ~/.cargo/git/checkouts/forge-a710e404260b9608/7b79eb5/src
grep -rn "fn table_name" ~/.cargo/git/checkouts/forge-a710e404260b9608/7b79eb5/src
grep -rn "table_name:" ~/.cargo/git/checkouts/forge-a710e404260b9608/7b79eb5/src
```

Record one of these outcomes:
- **A.** `Model::TABLE` (or similar associated const) exists — the `AdminBadge` trait can use `type Watches: forge::Model` and the registry reads `<T::Watches as Model>::TABLE`.
- **B.** No compile-time table accessor — the `AdminBadge` trait uses `const WATCHES_TABLE: &'static str;` instead (explicit string, developer writes `"deposits"` literally).

All subsequent tasks write the trait as **A** (preferred). If outcome is **B**, rewrite the trait and every `impl AdminBadge` in later tasks to use `const WATCHES_TABLE`.

- [ ] **Step 4: Confirm `Guard::Admin` subscribe path works for a plain channel**

Read `src/realtime/mod.rs` — the `ADMIN_PRESENCE` channel is registered with `Guard::Admin`. Our `admin:badges` registration will copy that exact pattern without `.presence(true)`. No verification step needed beyond reading the existing example.

- [ ] **Step 5: Document findings**

Write findings as inline comments at the top of `src/domain/badges/mod.rs` when the file is created in Task 2. No commit on this task — it's pure research.

---

## Task 2: Create `src/domain/badges/mod.rs` — trait, registry, descriptor

**Files:**
- Create: `src/domain/badges/mod.rs`
- Modify: `src/domain/mod.rs`

- [ ] **Step 1: Register the new module**

Edit `src/domain/mod.rs` — add `pub mod badges;` alongside the other `pub mod …;` lines.

- [ ] **Step 2: Write the unit tests**

Create `src/domain/badges/mod.rs` with:

```rust
//! Admin badge system — work-queue count indicators for the sidebar.
//!
//! See `docs/superpowers/specs/2026-04-21-admin-badge-system-design.md`.

use std::any::type_name;
use std::collections::{HashMap, HashSet};
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use async_trait::async_trait;
use forge::prelude::*;
use tokio::sync::Mutex;

use crate::ids::permissions::Permission;

/// Badge declaration. One `impl AdminBadge for T` per badge, kept in its own file
/// under `src/domain/badges/`.
///
/// - `KEY` is globally unique and namespaced (e.g. `"work.pending_topups"`).
/// - `PERMISSION` gates visibility in REST snapshots and over WS.
/// - `Watches` is the model whose save/delete should trigger a recompute. The
///   registry derives the table name at registration time via
///   `<Watches as forge::Model>::table_meta().name()`.
pub trait AdminBadge: Send + Sync + 'static {
    const KEY: &'static str;
    const PERMISSION: Permission;
    type Watches: forge::Model;

    fn count(ctx: &AppContext) -> Pin<Box<dyn Future<Output = Result<u64>> + Send + '_>>;
}

/// Type-erased descriptor stored in the registry.
#[derive(Clone)]
pub struct BadgeDescriptor {
    pub key: &'static str,
    pub permission: Permission,
    pub watches_table: String,
    pub count: Arc<
        dyn Fn(AppContext) -> Pin<Box<dyn Future<Output = Result<u64>> + Send>>
            + Send
            + Sync,
    >,
}

impl BadgeDescriptor {
    pub fn from_badge<B: AdminBadge>() -> Self {
        Self {
            key: B::KEY,
            permission: B::PERMISSION,
            watches_table: <B::Watches as forge::Model>::table_meta().name().to_string(),
            count: Arc::new(|ctx: AppContext| {
                Box::pin(async move { B::count(&ctx).await })
            }),
        }
    }
}

#[derive(Default)]
pub struct BadgeRegistry {
    by_key: HashMap<&'static str, BadgeDescriptor>,
    keys_by_table: HashMap<String, Vec<&'static str>>,
}

impl BadgeRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn register<B: AdminBadge>(&mut self) -> Result<()> {
        let descriptor = BadgeDescriptor::from_badge::<B>();
        self.insert(descriptor).map_err(|e| {
            Error::message(format!("{e} (conflicting impl: {})", type_name::<B>()))
        })
    }

    fn insert(&mut self, descriptor: BadgeDescriptor) -> Result<()> {
        if self.by_key.contains_key(descriptor.key) {
            return Err(Error::message(format!(
                "duplicate AdminBadge KEY `{}`",
                descriptor.key
            )));
        }
        self.keys_by_table
            .entry(descriptor.watches_table.clone())
            .or_default()
            .push(descriptor.key);
        self.by_key.insert(descriptor.key, descriptor);
        Ok(())
    }

    pub fn descriptor(&self, key: &str) -> Option<&BadgeDescriptor> {
        self.by_key.get(key)
    }

    pub fn keys_watching(&self, table: &str) -> &[&'static str] {
        self.keys_by_table
            .get(table)
            .map(|v| v.as_slice())
            .unwrap_or(&[])
    }

    pub fn iter_descriptors(&self) -> impl Iterator<Item = &BadgeDescriptor> {
        self.by_key.values()
    }
}

// Dispatcher and listener are defined in later tasks.

#[cfg(test)]
mod tests {
    use super::*;

    /// Test-only constructor that bypasses the `AdminBadge` generic. Building a
    /// full `forge::Model` stub just to exercise the registry's plumbing is
    /// overkill; the real `<T as forge::Model>::table_meta()` path is covered
    /// end-to-end by the integration test in Task 11.
    fn make_descriptor(key: &'static str, permission: Permission, table: &str) -> BadgeDescriptor {
        BadgeDescriptor {
            key,
            permission,
            watches_table: table.to_string(),
            count: Arc::new(|_| Box::pin(async { Ok(0u64) })),
        }
    }

    #[test]
    fn registers_multiple_badges_sharing_a_table() {
        let mut reg = BadgeRegistry::new();
        reg.insert(make_descriptor("test.a", Permission::AdminsRead, "fakes")).unwrap();
        reg.insert(make_descriptor("test.b", Permission::UsersRead, "fakes")).unwrap();
        assert!(reg.descriptor("test.a").is_some());
        assert!(reg.descriptor("test.b").is_some());
        let keys = reg.keys_watching("fakes");
        assert_eq!(keys.len(), 2);
        assert!(keys.contains(&"test.a"));
        assert!(keys.contains(&"test.b"));
    }

    #[test]
    fn rejects_duplicate_keys() {
        let mut reg = BadgeRegistry::new();
        reg.insert(make_descriptor("test.a", Permission::AdminsRead, "fakes")).unwrap();
        let err = reg
            .insert(make_descriptor("test.a", Permission::AdminsManage, "fakes"))
            .unwrap_err();
        assert!(err.to_string().contains("duplicate"));
    }

    #[test]
    fn keys_watching_returns_empty_for_unknown_table() {
        let reg = BadgeRegistry::new();
        assert!(reg.keys_watching("unknown").is_empty());
    }
}
```

- [ ] **Step 3: Run tests — expect pass**

Run: `cargo test --lib domain::badges`

Expected: 3 passing.

- [ ] **Step 4: `make check` to confirm nothing else broke**

Run: `make check`

Expected: clean.

- [ ] **Step 5: Pause for review**

Changes touch `src/domain/badges/mod.rs`, `src/domain/mod.rs`. Owner reviews + commits.

---

## Task 3: Dispatcher with 250 ms debounce + publish

**Files:**
- Modify: `src/domain/badges/mod.rs`

- [ ] **Step 1: Add debounce-buffer unit test**

At the bottom of the `#[cfg(test)] mod tests` block in `src/domain/badges/mod.rs`, add:

```rust
#[tokio::test]
async fn queue_recompute_coalesces_within_debounce_window() {
    let dispatcher = BadgeDispatcher::new_for_test(std::time::Duration::from_millis(50));
    dispatcher.queue_recompute("test.a");
    dispatcher.queue_recompute("test.a");
    dispatcher.queue_recompute("test.b");
    // Drain what would be flushed now — before timer fire, set contains both keys.
    let drained_now = dispatcher.drain_pending().await;
    assert_eq!(drained_now.len(), 2);
    assert!(drained_now.contains(&"test.a"));
    assert!(drained_now.contains(&"test.b"));
    // After draining, nothing left.
    let drained_after = dispatcher.drain_pending().await;
    assert!(drained_after.is_empty());
}
```

- [ ] **Step 2: Implement dispatcher**

Append to `src/domain/badges/mod.rs` (above the `#[cfg(test)]` block):

```rust
use crate::ids::channels as channel_ids;

pub struct BadgeDispatcher {
    registry: Arc<BadgeRegistry>,
    pending: Mutex<HashSet<&'static str>>,
    timer_active: Mutex<bool>,
    debounce: std::time::Duration,
    app: AppContext,
}

impl BadgeDispatcher {
    pub fn new(app: AppContext, registry: Arc<BadgeRegistry>) -> Arc<Self> {
        Arc::new(Self {
            registry,
            pending: Mutex::new(HashSet::new()),
            timer_active: Mutex::new(false),
            debounce: std::time::Duration::from_millis(250),
            app,
        })
    }

    #[cfg(test)]
    pub fn new_for_test(debounce: std::time::Duration) -> Arc<Self> {
        // Test-only constructor that does not require AppContext — used only for
        // exercising the debounce buffer. Flush path is covered by the integration
        // test in Task 11.
        Arc::new(Self {
            registry: Arc::new(BadgeRegistry::new()),
            pending: Mutex::new(HashSet::new()),
            timer_active: Mutex::new(false),
            debounce,
            app: AppContext::for_test(),
        })
    }

    pub fn queue_recompute(self: &Arc<Self>, key: &'static str) {
        let this = self.clone();
        tokio::spawn(async move {
            this.pending.lock().await.insert(key);
            let mut active = this.timer_active.lock().await;
            if !*active {
                *active = true;
                drop(active);
                let dispatcher = this.clone();
                tokio::spawn(async move {
                    tokio::time::sleep(dispatcher.debounce).await;
                    dispatcher.flush().await;
                    *dispatcher.timer_active.lock().await = false;
                });
            }
        });
    }

    pub async fn drain_pending(&self) -> HashSet<&'static str> {
        std::mem::take(&mut *self.pending.lock().await)
    }

    async fn flush(self: &Arc<Self>) {
        let keys = self.drain_pending().await;
        for key in keys {
            let Some(descriptor) = self.registry.descriptor(key) else {
                continue;
            };
            let count = match (descriptor.count)(self.app.clone()).await {
                Ok(n) => n,
                Err(err) => {
                    tracing::warn!(badge.key = %key, error = %err, "badge count failed; skipping publish");
                    continue;
                }
            };
            let payload = serde_json::json!({ "key": key, "count": count });
            if let Ok(publisher) = self.app.websocket() {
                if let Err(err) = publisher
                    .publish(channel_ids::ADMIN_BADGES, channel_ids::BADGE_UPDATED, None, payload)
                    .await
                {
                    tracing::warn!(badge.key = %key, error = %err, "badge publish failed");
                }
            }
        }
    }
}
```

> **Note:** If Task 1 established that `AppContext::for_test()` does not exist, replace `new_for_test` with a variant that avoids `AppContext` entirely — expose `drain_pending` on a struct that owns only the debounce buffer, extracted as an inner `BadgeDispatchBuffer` type. The integration test in Task 11 covers the real flush path, so this test-only isolation is only to exercise the buffer semantics.

- [ ] **Step 3: Run tests**

Run: `cargo test --lib domain::badges`

Expected: all 4 passing (3 from Task 2 + 1 new).

- [ ] **Step 4: Add channel ID constants (prerequisite for dispatcher compile)**

Edit `src/ids/channels.rs`:

```rust
use forge::prelude::*;

pub const NOTIFICATIONS: ChannelId = ChannelId::new("notifications");
pub const NOTIFICATION_EVENT: ChannelEventId = ChannelEventId::new("notification");
pub const ADMIN_PRESENCE: ChannelId = ChannelId::new("admin:presence");
pub const ADMIN_BADGES: ChannelId = ChannelId::new("admin:badges");
pub const BADGE_UPDATED: ChannelEventId = ChannelEventId::new("badge:updated");
```

- [ ] **Step 5: `make check`**

Run: `make check`

Expected: clean.

- [ ] **Step 6: Pause for review**

---

## Task 4: `BadgeLifecycleListener` — wire model events to dispatcher

**Files:**
- Modify: `src/domain/badges/mod.rs`

- [ ] **Step 1: Implement the listener**

Append to `src/domain/badges/mod.rs` (above `#[cfg(test)]`):

```rust
use forge::database::{ModelCreatedEvent, ModelDeletedEvent, ModelUpdatedEvent};

pub struct BadgeLifecycleListener {
    dispatcher: Arc<BadgeDispatcher>,
}

impl BadgeLifecycleListener {
    pub fn new(dispatcher: Arc<BadgeDispatcher>) -> Self {
        Self { dispatcher }
    }

    fn enqueue_for_table(&self, table: &str) {
        for key in self.dispatcher.registry.keys_watching(table) {
            self.dispatcher.queue_recompute(key);
        }
    }
}

#[async_trait]
impl EventListener<ModelCreatedEvent> for BadgeLifecycleListener {
    async fn handle(&self, _ctx: &EventContext, event: &ModelCreatedEvent) -> Result<()> {
        self.enqueue_for_table(&event.snapshot.table);
        Ok(())
    }
}

#[async_trait]
impl EventListener<ModelUpdatedEvent> for BadgeLifecycleListener {
    async fn handle(&self, _ctx: &EventContext, event: &ModelUpdatedEvent) -> Result<()> {
        self.enqueue_for_table(&event.snapshot.table);
        Ok(())
    }
}

#[async_trait]
impl EventListener<ModelDeletedEvent> for BadgeLifecycleListener {
    async fn handle(&self, _ctx: &EventContext, event: &ModelDeletedEvent) -> Result<()> {
        self.enqueue_for_table(&event.snapshot.table);
        Ok(())
    }
}
```

> **Note:** The exact import path for `ModelCreatedEvent` et al. is confirmed in Task 1. If they live under a different module path in Forge (e.g. `forge::model::lifecycle::*`), update the `use` statement accordingly. The struct name and the `snapshot.table` field are confirmed in Task 1.

- [ ] **Step 2: `make check`**

Run: `make check`

Expected: clean (no tests for the listener yet — full wiring is covered by the integration test in Task 11).

- [ ] **Step 3: Pause for review**

---

## Task 5: `BadgeServiceProvider` — register registry + listener

**Files:**
- Create: `src/providers/badge_service_provider.rs`
- Modify: `src/providers/mod.rs`

- [ ] **Step 1: Create the provider**

Create `src/providers/badge_service_provider.rs`:

```rust
use std::sync::Arc;

use async_trait::async_trait;
use forge::database::{ModelCreatedEvent, ModelDeletedEvent, ModelUpdatedEvent};
use forge::prelude::*;

use crate::domain::badges::{BadgeDispatcher, BadgeLifecycleListener, BadgeRegistry};

pub struct BadgeServiceProvider;

#[async_trait]
impl ServiceProvider for BadgeServiceProvider {
    async fn register(&self, registrar: &mut ServiceRegistrar) -> Result<()> {
        let mut registry = BadgeRegistry::new();

        // Register all badge implementations here. In v1 nothing concrete ships;
        // the dev-only smoke badge is registered in Task 10 behind a cfg/env gate.
        register_all_badges(&mut registry)?;

        let registry = Arc::new(registry);

        // Bind registry + dispatcher to the app container.
        registrar.bind_singleton::<Arc<BadgeRegistry>>(registry.clone())?;
        registrar.bind_factory::<Arc<BadgeDispatcher>>(move |app| {
            Ok(BadgeDispatcher::new(app.clone(), registry.clone()))
        })?;

        // Listen to model lifecycle events, enqueueing recomputes for watched tables.
        registrar.listen_event::<ModelCreatedEvent, _>(Listener);
        registrar.listen_event::<ModelUpdatedEvent, _>(Listener);
        registrar.listen_event::<ModelDeletedEvent, _>(Listener);

        Ok(())
    }
}

/// Centralized registration point so every concrete badge goes through one place.
fn register_all_badges(_registry: &mut BadgeRegistry) -> Result<()> {
    // Production badges are added here as features land. Example:
    //   registry.register::<PendingTopups>()?;
    //
    // The dev-only smoke badge is registered in Task 10 conditionally.
    Ok(())
}

struct Listener;

#[async_trait]
impl EventListener<ModelCreatedEvent> for Listener {
    async fn handle(&self, ctx: &EventContext, event: &ModelCreatedEvent) -> Result<()> {
        let dispatcher = ctx.app().resolve::<Arc<BadgeDispatcher>>()?;
        BadgeLifecycleListener::new(dispatcher)
            .handle(ctx, event)
            .await
    }
}

#[async_trait]
impl EventListener<ModelUpdatedEvent> for Listener {
    async fn handle(&self, ctx: &EventContext, event: &ModelUpdatedEvent) -> Result<()> {
        let dispatcher = ctx.app().resolve::<Arc<BadgeDispatcher>>()?;
        BadgeLifecycleListener::new(dispatcher)
            .handle(ctx, event)
            .await
    }
}

#[async_trait]
impl EventListener<ModelDeletedEvent> for Listener {
    async fn handle(&self, ctx: &EventContext, event: &ModelDeletedEvent) -> Result<()> {
        let dispatcher = ctx.app().resolve::<Arc<BadgeDispatcher>>()?;
        BadgeLifecycleListener::new(dispatcher)
            .handle(ctx, event)
            .await
    }
}
```

> **Note on container API:** the exact names `bind_singleton` / `bind_factory` / `resolve` come from Forge's `ServiceRegistrar` / `AppContext`. If Task 1's research surfaced different names (e.g. `instance(...)`, `singleton(...)`, `get::<T>()`), substitute them here and in Task 11's test. The intent is: register `Arc<BadgeRegistry>` as a shared singleton and `Arc<BadgeDispatcher>` such that resolving it twice yields the same dispatcher (so its debounce buffer is shared).

- [ ] **Step 2: Export the provider**

Edit `src/providers/mod.rs`:

```rust
pub mod app_service_provider;
pub mod badge_service_provider;
pub mod event_service_provider;
pub use app_service_provider::AppServiceProvider;
pub use badge_service_provider::BadgeServiceProvider;
pub use event_service_provider::EventServiceProvider;
```

- [ ] **Step 3: `make check`**

Run: `make check`

Expected: clean.

- [ ] **Step 4: Pause for review**

---

## Task 6: `badge_service::current_counts`

**Files:**
- Create: `src/domain/services/badge_service.rs`
- Modify: `src/domain/services/mod.rs`

- [ ] **Step 1: Register the new service module**

Edit `src/domain/services/mod.rs` — add `pub mod badge_service;` alongside the other modules.

- [ ] **Step 2: Create the service**

Create `src/domain/services/badge_service.rs`:

```rust
use std::collections::BTreeMap;
use std::sync::Arc;

use forge::prelude::*;

use crate::domain::badges::BadgeRegistry;
use crate::domain::models::Admin;
use crate::domain::services::admin_service;

/// Compute the current badge counts for `admin`, filtered to the badges whose
/// permission is in the admin's effective permission set.
///
/// Returns `{ key: count }` for every permitted badge, including counts of 0.
/// That full snapshot is what the frontend uses to build its allowlist for WS
/// filtering.
pub async fn current_counts(
    app: &AppContext,
    admin: &Admin,
) -> Result<BTreeMap<String, u64>> {
    let registry = app.resolve::<Arc<BadgeRegistry>>()?;
    let permissions: std::collections::BTreeSet<_> =
        admin_service::effective_permissions(admin).into_iter().collect();

    let mut out = BTreeMap::new();
    for descriptor in registry.iter_descriptors() {
        if !permissions.contains(&descriptor.permission) {
            continue;
        }
        let count = (descriptor.count)(app.clone()).await?;
        out.insert(descriptor.key.to_string(), count);
    }
    Ok(out)
}
```

- [ ] **Step 3: `make check`**

Run: `make check`

Expected: clean.

- [ ] **Step 4: Pause for review**

---

## Task 7: Admin REST endpoint `GET /api/v1/admin/badges`

**Files:**
- Create: `src/portals/admin/badge_routes.rs`
- Modify: `src/portals/admin/responses.rs`
- Modify: `src/portals/admin/mod.rs`

- [ ] **Step 1: Add response DTO**

Edit `src/portals/admin/responses.rs` — append:

```rust
use std::collections::BTreeMap;

#[derive(Serialize, TS, forge::ApiSchema)]
#[ts(export)]
pub struct BadgeCountsResponse(pub BTreeMap<String, u64>);
```

If `BTreeMap` and `Serialize`/`TS` imports aren't already present, add them with the other imports at the top of the file. Use an existing response in the file as a template for imports.

- [ ] **Step 2: Create the handler**

Create `src/portals/admin/badge_routes.rs`:

```rust
use axum::extract::State;
use forge::prelude::*;

use crate::domain::models::Admin;
use crate::domain::services::badge_service;
use crate::portals::admin::responses::BadgeCountsResponse;

pub async fn index(State(app): State<AppContext>) -> Result<impl IntoResponse> {
    let admin = app
        .resolve_actor::<Admin>()
        .await?
        .ok_or_else(|| Error::unauthorized("admin not authenticated"))?;
    let counts = badge_service::current_counts(&app, &admin).await?;
    Ok(Json(BadgeCountsResponse(counts)))
}
```

> **Note:** Use the existing `src/portals/admin/log_routes.rs` or another handler as a pattern reference if the `State(app)` extractor or `resolve_actor` API name differs. The shape above matches `AdminMeResponse::from_admin(&admin)` style handlers already in the codebase.

- [ ] **Step 3: Register the module + route**

Edit `src/portals/admin/mod.rs`:

- Add `pub mod badge_routes;` alongside the other module declarations.
- Add `BadgeCountsResponse` to the `use crate::portals::admin::responses::{...};` import.
- Inside the `r.scope("/admin", |admin| { ... })` block, register the route next to the other simple admin routes (pick a natural spot; after the `/profile` block is fine):

```rust
admin.scope("/badges", |badges| {
    badges
        .name_prefix("badges")
        .tag("admin:badges")
        .guard(Guard::Admin);

    badges.get("", "index", badge_routes::index, |route| {
        route.summary("Current admin badge counts");
        route.response::<BadgeCountsResponse>(200);
    });

    Ok(())
})?;
```

- [ ] **Step 4: `make check`**

Run: `make check`

Expected: clean.

- [ ] **Step 5: Generate TS types**

Run: `make types`

Expected: `frontend/shared/types/generated/BadgeCountsResponse.ts` is generated. Record the exact path.

- [ ] **Step 6: Pause for review**

---

## Task 8: Register `admin:badges` WebSocket channel

**Files:**
- Modify: `src/realtime/mod.rs`

- [ ] **Step 1: Add the channel registration**

Edit `src/realtime/mod.rs`:

```rust
use crate::ids;
use forge::prelude::*;

pub fn register(registrar: &mut WebSocketRegistrar) -> Result<()> {
    registrar.channel_with_options(
        ids::channels::NOTIFICATIONS,
        |context: WebSocketContext, payload: serde_json::Value| async move {
            context
                .publish(ids::channels::NOTIFICATION_EVENT, payload)
                .await
        },
        WebSocketChannelOptions::new().guard(ids::guards::Guard::User),
    )?;

    registrar.channel_with_options(
        ids::channels::ADMIN_PRESENCE,
        |_context: WebSocketContext, _payload: serde_json::Value| async move { Ok(()) },
        WebSocketChannelOptions::new()
            .guard(ids::guards::Guard::Admin)
            .presence(true),
    )?;

    registrar.channel_with_options(
        ids::channels::ADMIN_BADGES,
        |_context: WebSocketContext, _payload: serde_json::Value| async move { Ok(()) },
        WebSocketChannelOptions::new().guard(ids::guards::Guard::Admin),
    )?;

    Ok(())
}
```

The subscribe handler is a no-op — clients only listen; they never publish to this channel. All pushes come from the dispatcher via `app.websocket()?.publish(...)`.

- [ ] **Step 2: `make check`**

Run: `make check`

Expected: clean.

- [ ] **Step 3: Pause for review**

---

## Task 9: Register `BadgeServiceProvider` in http + websocket bootstraps

**Files:**
- Modify: `src/bootstrap/http.rs`
- Modify: `src/bootstrap/websocket.rs`

- [ ] **Step 1: Locate existing provider registration points**

Open `src/bootstrap/app.rs` (the `base()` function referenced by both http and websocket kernels). Confirm where `AppServiceProvider` and `EventServiceProvider` are registered. `BadgeServiceProvider` goes next to those calls so that both the HTTP and WebSocket processes share the same providers.

- [ ] **Step 2: Register `BadgeServiceProvider` in `app.rs`**

Edit `src/bootstrap/app.rs` — add the import `use crate::providers::BadgeServiceProvider;` and register it alongside the existing providers (pattern match against the `.register_provider(AppServiceProvider)` / `.register_provider(EventServiceProvider)` lines). Register `BadgeServiceProvider` **after** `EventServiceProvider` so the badge listener is installed after the event bus is live.

> **Note:** If for some reason `BadgeServiceProvider` needs to be registered only on HTTP + WebSocket kernels (not Worker / Scheduler), do it in `bootstrap/http.rs` and `bootstrap/websocket.rs` individually instead of `app.rs`. Either works; the former is DRY-er.

- [ ] **Step 3: `make check`**

Run: `make check`

Expected: clean.

- [ ] **Step 4: Pause for review**

---

## Task 10: Dev-only smoke badge `DevDummyBadge`

**Files:**
- Create: `src/domain/badges/dev_dummy.rs`
- Modify: `src/domain/badges/mod.rs` (module export)
- Modify: `src/providers/badge_service_provider.rs` (conditional registration)

- [ ] **Step 1: Create the smoke badge**

Create `src/domain/badges/dev_dummy.rs`:

```rust
//! Smoke-test badge used for integration testing the badge infrastructure
//! end-to-end. Only registered when `APP__BADGES__DEV_DUMMY=true` is set.
//!
//! Watches the `admins` table (every Forge project has one) and counts rows.

use std::future::Future;
use std::pin::Pin;

use forge::prelude::*;

use crate::domain::badges::AdminBadge;
use crate::domain::models::Admin;
use crate::ids::permissions::Permission;

pub struct DevDummyBadge;

impl AdminBadge for DevDummyBadge {
    const KEY: &'static str = "work.dev_dummy";
    const PERMISSION: Permission = Permission::AdminsRead;
    type Watches = Admin;

    fn count(ctx: &AppContext) -> Pin<Box<dyn Future<Output = Result<u64>> + Send + '_>> {
        Box::pin(async move {
            let ctx = ctx.clone();
            let n = Admin::query().count(&ctx).await?;
            Ok(n)
        })
    }
}
```

- [ ] **Step 2: Export the module**

Edit `src/domain/badges/mod.rs` — add at the top:

```rust
pub mod dev_dummy;
```

- [ ] **Step 3: Register conditionally**

Edit `src/providers/badge_service_provider.rs` — update `register_all_badges`:

```rust
fn register_all_badges(registry: &mut BadgeRegistry) -> Result<()> {
    if std::env::var("APP__BADGES__DEV_DUMMY").is_ok_and(|v| v == "true") {
        use crate::domain::badges::dev_dummy::DevDummyBadge;
        registry.register::<DevDummyBadge>()?;
    }
    Ok(())
}
```

- [ ] **Step 4: `make check`**

Run: `make check`

Expected: clean.

- [ ] **Step 5: Pause for review**

---

## Task 11: Integration test — REST + lifecycle → WS push

**Files:**
- Create: `tests/admin_badges.rs`

- [ ] **Step 1: Choose a baseline test to copy**

Open `tests/user_baseline.rs` and `tests/observability_access.rs`. Pick whichever has a closer pattern (HTTP + auth boot + DB reset). The new test follows the same bootstrap helpers (`reset_database`, `boot_api`, `send_json`, token auth).

- [ ] **Step 2: Write the test**

Create `tests/admin_badges.rs`:

```rust
//! Integration test for the admin badge system.
//!
//! Boots the API with `APP__BADGES__DEV_DUMMY=true`, authenticates as a developer
//! admin, hits `GET /api/v1/admin/badges`, saves a new Admin (which fires
//! ModelCreatedEvent for `admins` — the table DevDummyBadge watches), and asserts
//! the WebSocket published a `badge:updated` event with the new count.

use serde_json::json;

// Import whatever helpers `tests/user_baseline.rs` uses — e.g.
//   mod common; use common::*;
// or direct `use forge_starter::...` + local helper functions.

#[tokio::test]
async fn badge_snapshot_returns_dev_dummy_count() {
    std::env::set_var("APP__BADGES__DEV_DUMMY", "true");

    let app = boot_api().await;
    reset_database(&app).await;
    let token = login_as_developer(&app).await;

    let response = send_json(&app, "GET", "/api/v1/admin/badges", Some(&token), json!({}))
        .await;

    assert_eq!(response.status, 200);
    let body = response.json::<serde_json::Value>();
    // DevDummyBadge counts Admin rows. Seed data has >= 1 developer admin.
    let count = body.get("work.dev_dummy").and_then(|v| v.as_u64()).unwrap();
    assert!(count >= 1, "expected at least 1 admin row, got {count}");
}

#[tokio::test]
async fn badge_snapshot_omits_keys_admin_lacks_permission_for() {
    std::env::set_var("APP__BADGES__DEV_DUMMY", "true");

    let app = boot_api().await;
    reset_database(&app).await;

    // Log in as a plain-admin actor with no AdminsRead permission.
    let token = login_as_admin_without(&app, &["admins.read", "admins.manage"]).await;

    let response = send_json(&app, "GET", "/api/v1/admin/badges", Some(&token), json!({}))
        .await;

    assert_eq!(response.status, 200);
    let body = response.json::<serde_json::Value>();
    let obj = body.as_object().unwrap();
    assert!(!obj.contains_key("work.dev_dummy"));
}

#[tokio::test]
async fn model_save_publishes_badge_update_on_admin_badges_channel() {
    std::env::set_var("APP__BADGES__DEV_DUMMY", "true");

    let app = boot_api().await;
    reset_database(&app).await;

    // Subscribe a test WS listener to `admin:badges`.
    let mut received = subscribe_ws(&app, "admin:badges").await;

    // Create a new admin row → fires ModelCreatedEvent for `admins`
    // → listener enqueues dev_dummy recompute → dispatcher debounces 250 ms
    // → publishes { key: "work.dev_dummy", count: N } to admin:badges.
    create_admin_row(&app, "smoke_tester@example.com").await;

    // Wait longer than the 250 ms debounce + publish latency.
    let event = received
        .recv_timeout(std::time::Duration::from_secs(2))
        .expect("expected badge:updated event within 2s");

    assert_eq!(event.event_id, "badge:updated");
    let payload = event.payload.as_object().unwrap();
    assert_eq!(payload["key"], "work.dev_dummy");
    assert!(payload["count"].is_u64());
}
```

> **Note:** The `boot_api`, `reset_database`, `login_as_developer`, `login_as_admin_without`, `subscribe_ws`, `create_admin_row`, and `send_json` helpers must match whatever pattern the existing integration tests use. Copy the precise helper imports and function signatures from `tests/user_baseline.rs`. If a helper doesn't exist (e.g. `subscribe_ws`), add it to a shared `tests/common/mod.rs` following the existing style.

- [ ] **Step 3: Run the test**

Run: `cargo test --test admin_badges -- --nocapture`

Expected: all three passing. If the WS test times out, investigate whether Redis is running (dispatcher publishes via Redis-backed `WebSocketPublisher`). `make dev` infrastructure typically starts Redis; `cargo test` may require an explicit Redis docker or test-configured inline backend — match the pattern the other integration tests use.

- [ ] **Step 4: `make check && make lint`**

Run: `make check && make lint`

Expected: clean.

- [ ] **Step 5: Pause for review**

---

## Task 12: Rename `MenuItem.notification` → `MenuItem.badge`

**Files:**
- Modify: `frontend/admin/src/config/side-menu.ts`

- [ ] **Step 1: Rename the field**

Edit `frontend/admin/src/config/side-menu.ts`:

```typescript
export type MenuItem = {
  key: string;
  label: string;
  icon?: LucideIcon;
  path?: string;
  permission?: Permission;
  adminTypes?: readonly AdminType[];
  badge?: string;            // was `notification?: string`
  children?: MenuItem[];
};
```

No other call sites exist (the field is currently unused), so no further edits should be needed.

- [ ] **Step 2: Verify no stragglers**

Run:

```bash
grep -rn "\.notification" frontend/admin/src
grep -rn "notification?:" frontend/admin/src
```

Expected: no hits (the renamed field is now `badge?:`).

- [ ] **Step 3: `make types && make lint`**

Run: `make types && make lint`

Expected: clean.

- [ ] **Step 4: Pause for review**

---

## Task 13: `badgeStore` + `useBadge` + `useBadgeSum`

**Files:**
- Create: `frontend/admin/src/stores/badgeStore.ts`

- [ ] **Step 1: Create the store**

Create `frontend/admin/src/stores/badgeStore.ts`:

```typescript
import { createStore, useStore } from "@shared/store";

type BadgeState = {
    counts: Record<string, number>;
    loaded: boolean;
};

const badgeStore = createStore<BadgeState>({ counts: {}, loaded: false });

export const adminBadges = {
    /** Hydrate from REST snapshot. Replaces the full counts map and marks loaded. */
    hydrate(counts: Record<string, number>) {
        badgeStore.setState({ counts, loaded: true });
    },
    /** Apply a single WS delta. Caller should gate with `knows(key)` first. */
    set(key: string, count: number) {
        badgeStore.setState((prev) => ({
            counts: { ...prev.counts, [key]: count },
        }));
    },
    /** Returns true iff `key` was included in the last REST snapshot (allowlist). */
    knows(key: string): boolean {
        return key in badgeStore.getState().counts;
    },
    /** Reset to empty state on logout. */
    reset() {
        badgeStore.setState({ counts: {}, loaded: false });
    },
};

/** Component hook: current count for a single key (0 if unset or undefined). */
export function useBadge(key?: string): number {
    return useStore(badgeStore, (state) =>
        key ? (state.counts[key] ?? 0) : 0,
    );
}

/** Component hook: sum of counts across `keys` (unset keys count as 0). */
export function useBadgeSum(keys: readonly string[]): number {
    return useStore(badgeStore, (state) =>
        keys.reduce((acc, key) => acc + (state.counts[key] ?? 0), 0),
    );
}
```

- [ ] **Step 2: `make lint`**

Run: `make lint`

Expected: clean.

- [ ] **Step 3: Pause for review**

---

## Task 14: `getBadgeCount` aggregation helper

**Files:**
- Create: `frontend/admin/src/components/sidebar/getBadgeCount.ts`

- [ ] **Step 1: Implement the helper**

Create `frontend/admin/src/components/sidebar/getBadgeCount.ts`:

```typescript
import type { MenuItem } from "@/config/side-menu";

/**
 * Compute the badge count to render for `item`, given the current counts map
 * and a predicate that decides whether a menu entry is visible to the current
 * admin.
 *
 * Rule: parent's displayed count = own `badge` count (if any) + Σ visible
 * children's displayed counts (recursive). A hidden child contributes 0.
 */
export function getBadgeCount(
    item: MenuItem,
    counts: Record<string, number>,
    canSee: (item: MenuItem) => boolean,
): number {
    let total = item.badge ? (counts[item.badge] ?? 0) : 0;
    if (item.children?.length) {
        for (const child of item.children) {
            if (!canSee(child)) continue;
            total += getBadgeCount(child, counts, canSee);
        }
    }
    return total;
}
```

- [ ] **Step 2: `make lint`**

Run: `make lint`

Expected: clean.

- [ ] **Step 3: Pause for review**

---

## Task 15: `Badge` pill component

**Files:**
- Create: `frontend/admin/src/components/sidebar/Badge.tsx`

- [ ] **Step 1: Create the component**

Create `frontend/admin/src/components/sidebar/Badge.tsx`:

```typescript
import { clsx } from "clsx";

interface BadgeProps {
    count: number;
    className?: string;
}

export function Badge({ count, className }: BadgeProps) {
    if (count <= 0) return null;
    const label = count > 99 ? "99+" : String(count);
    return (
        <span
            className={clsx(
                "inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 text-xs font-medium rounded-full bg-red-500 text-white",
                className,
            )}
            aria-label={`${label} pending`}
        >
            {label}
        </span>
    );
}
```

> **Note:** Confirm `clsx` (or the project's existing `cn`/`clsx` util) is available by checking other components in `frontend/admin/src/components/`. If the project uses a shared `cn()` helper from `@/utils` or similar, swap the import. Don't install a new dep.

- [ ] **Step 2: `make lint && make types`**

Run: `make lint && make types`

Expected: clean.

- [ ] **Step 3: Pause for review**

---

## Task 16: WS wiring in `App.tsx` — hydrate + subscribe + reset on auth

**Files:**
- Modify: `frontend/admin/src/App.tsx`

- [ ] **Step 1: Add the hydration + filtered listener**

Edit `frontend/admin/src/App.tsx`. The `onAuthChange` callback currently looks like:

```typescript
return auth.onAuthChange((user) => {
    if (!user) {
        ws.disconnect();
        return;
    }
    const currentLocale = localeStore.locale;
    if (user.locale !== currentLocale) {
        api.put("/profile/locale", { locale: currentLocale }).catch(() => {});
    }
    ws.connect();
    ws.subscribe("admin:presence");
});
```

Replace it with:

```typescript
return auth.onAuthChange(async (user) => {
    if (!user) {
        adminBadges.reset();
        ws.disconnect();
        return;
    }
    const currentLocale = localeStore.locale;
    if (user.locale !== currentLocale) {
        api.put("/profile/locale", { locale: currentLocale }).catch(() => {});
    }

    // Hydrate badges before connecting so WS deltas arriving immediately after
    // connect already have a populated allowlist.
    try {
        const { data } = await api.get<Record<string, number>>("/badges");
        adminBadges.hydrate(data);
    } catch {
        adminBadges.hydrate({});
    }

    ws.connect();
    ws.subscribe("admin:presence");
    ws.subscribe("admin:badges");
    ws.on(
        "admin:badges",
        "badge:updated",
        (payload: { key: string; count: number }) => {
            if (!adminBadges.knows(payload.key)) return;
            adminBadges.set(payload.key, payload.count);
        },
    );
});
```

Add the import at the top of the file: `import { adminBadges } from "@/stores/badgeStore";`.

> **Note on reconnect:** if `ws` exposes a reconnect hook (check `frontend/shared/websocket/createWebSocket.ts` — it has `useStatus()` and likely an `onReconnect` callback), wire up a reconnect handler that re-calls `api.get("/badges")` + `adminBadges.hydrate(...)`. If no explicit hook exists, the current behavior (keep stale counts until next login) is acceptable for v1 — document in code with a `// TODO(badges): refetch on reconnect` comment so a future engineer catches it.

- [ ] **Step 2: `make lint && make types`**

Run: `make lint && make types`

Expected: clean.

- [ ] **Step 3: Pause for review**

---

## Task 17: Sidebar renderer integration

**Files:**
- Modify: `frontend/admin/src/components/Sidebar.tsx`

- [ ] **Step 1: Read the current sidebar**

Read `frontend/admin/src/components/Sidebar.tsx` in full. Identify:
- The component that renders a single menu item.
- The permission-visibility predicate (the logic that hides an item when the admin lacks the required permission or admin type). Extract or reuse it as the `canSee` function.

- [ ] **Step 2: Render the badge**

Inside the single-menu-item component, import the helpers:

```typescript
import { Badge } from "@/components/sidebar/Badge";
import { getBadgeCount } from "@/components/sidebar/getBadgeCount";
import { useStore } from "@shared/store";
import { adminBadges } from "@/stores/badgeStore";
```

Select counts reactively (pick whichever matches the file's existing hook style — we need the whole counts map here so the helper can walk children):

```typescript
const counts = useStore(
    // If the file already exports the underlying store, reuse it; otherwise
    // expose an internal `useBadgeCounts` helper in badgeStore.ts that returns
    // the counts map directly. Prefer that route for reactivity correctness.
);
```

If you need to add a `useBadgeCounts` hook, add it to `frontend/admin/src/stores/badgeStore.ts`:

```typescript
export function useBadgeCounts(): Record<string, number> {
    return useStore(badgeStore, (state) => state.counts);
}
```

Then in the menu-item renderer, immediately after the label JSX but before closing the clickable wrapper, render:

```tsx
{(() => {
    const count = getBadgeCount(item, counts, canSee);
    return count > 0 ? <Badge count={count} className="ml-auto" /> : null;
})()}
```

Adjust class names to match the existing menu-item layout (flex alignment etc.). The `ml-auto` pushes the pill to the right edge of the row.

- [ ] **Step 3: Visual smoke**

Run: `make dev` in one terminal (in another if already running, leave it).

Manually:
1. Log in to the admin portal as a developer admin.
2. With `APP__BADGES__DEV_DUMMY=true` set in `.env`, confirm the sidebar menu item corresponding to Admins shows a badge equal to the admin count.
3. Open a second terminal, create a new admin via the API or CLI.
4. Within ~250 ms, the badge count increments.
5. Delete that admin — badge decrements.

If any step fails, diagnose and fix.

- [ ] **Step 4: `make check && make lint && make types`**

Run: `make check && make lint && make types`

Expected: clean.

- [ ] **Step 5: Pause for review**

---

## Task 18: Final verification + cleanup

**Files:** none modified.

- [ ] **Step 1: Full verification**

Run:

```bash
make check
make lint
make types
cargo test --test admin_badges
cargo test --lib domain::badges
```

Expected: all clean / all passing.

- [ ] **Step 2: Remove or guard the dev-dummy badge before shipping**

The smoke badge is already gated behind `APP__BADGES__DEV_DUMMY=true`, so it's inert unless explicitly opted in. No action needed unless the repo owner wants to delete it entirely — that's a judgment call to leave to owner review.

- [ ] **Step 3: Confirm zero remaining references to "notification" in the badge context**

Run:

```bash
grep -rn "notification" frontend/admin/src/config/side-menu.ts frontend/admin/src/components/Sidebar.tsx
grep -rn "AdminNotification\|adminNotificationStore" frontend/ src/
```

Expected: zero hits (only Forge's built-in user-facing notification plumbing should remain, untouched, in its own namespace).

- [ ] **Step 4: Pause for final review**

Hand off to owner for final review + commit.

---

## Self-Review (writing-plans skill checklist)

**1. Spec coverage:**
- AdminBadge trait shape → Task 2
- Namespaced `work.*` keys → enforced by convention, example in Task 10 + docstring in Task 2
- Debounced dispatcher (250 ms) → Task 3
- Model lifecycle wiring → Task 4 + Task 5
- BadgeServiceProvider registration in http + websocket kernels → Task 5 + Task 9
- REST `GET /api/v1/admin/badges` with permission-filtered snapshot → Task 6 + Task 7
- Shared `admin:badges` WS channel with `Guard::Admin` → Task 8
- Cross-process publishing via `app.websocket()?.publish(...)` → Task 3
- Payload `{ key, count }` on event `badge:updated` → Task 3
- Dev-only smoke badge → Task 10
- Integration test covering REST + lifecycle → WS → Task 11
- `MenuItem.notification` → `MenuItem.badge` rename → Task 12
- `adminBadges` store with `hydrate` / `set` / `knows` / `reset` → Task 13
- `useBadge` / `useBadgeSum` selectors → Task 13
- `getBadgeCount` aggregation (own + visible children, recursive) → Task 14
- `Badge` pill component with `99+` clamp + zero hidden → Task 15
- Hydrate + subscribe on auth change, filter WS deltas by allowlist → Task 16
- Sidebar renderer uses helper + component → Task 17
- Final `make check && make lint && make types` gate → Task 18

**2. Placeholder scan:** No "TBD" / "implement later" remain. Where implementation details depend on Forge API verification (Task 1), alternatives are explicitly called out with concrete substitute code. The integration test in Task 11 names helper functions that must exist or be added — that's unavoidable without physically running Forge's test harness in the plan-writing step.

**3. Type consistency:** `BadgeDescriptor`, `BadgeRegistry`, `BadgeDispatcher`, `BadgeLifecycleListener`, `BadgeServiceProvider`, `adminBadges`, `useBadge`, `useBadgeSum`, `useBadgeCounts`, `getBadgeCount`, `BadgeCountsResponse`, `ADMIN_BADGES`, `BADGE_UPDATED` are consistent across every task they appear in.

**4. Implementation sequencing:** Backend tasks 2–11 can execute in declared order. Frontend tasks 12–17 depend only on Task 12's type rename being landed (and Task 7 having generated `BadgeCountsResponse` TS bindings). Tasks 2–11 and 12–17 may run in parallel streams if desired.
