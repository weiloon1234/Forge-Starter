//! Admin badge system — work-queue count indicators for the sidebar.
//!
//! Each badge answers "how many items need admin action?" (e.g. pending
//! top-ups, pending KYC). Not to be confused with `forge::Notification`, which
//! is outbound message delivery.
//!
//! # Adding a new badge
//!
//! 1. Create `src/domain/badges/<name>.rs` with `impl AdminBadge for YourBadge`
//!    — declare `KEY` (namespaced, e.g. `"work.pending_topups"`), `PERMISSION`,
//!    `type Watches: forge::Model`, and an async `count()` query.
//! 2. Add `pub mod <name>;` here in `src/domain/badges/mod.rs`.
//! 3. Register in `src/providers/badge_service_provider.rs` inside
//!    `register_all_badges`: `registry.register::<YourBadge>()?;`.
//! 4. Reference the key on a `MenuItem` in
//!    `frontend/admin/src/config/side-menu.ts`: `badge: "work.your_key"`.
//!
//! No manual publish calls are needed. Forge's `ModelCreated/Updated/Deleted`
//! events auto-trigger debounced (250 ms) recomputes via
//! [`BadgeLifecycleListener`], and the [`BadgeDispatcher`] publishes to the
//! shared `admin:badges` channel.
//!
//! # Example — strongly-typed `count()`
//!
//! Use macro-generated column constants (e.g. `TopUp::STATUS`) and app-owned
//! enums (in `src/domain/enums/`) — never stringly-typed `.where_eq("status",
//! "pending")`. The `#[derive(forge::Model)]` and `#[derive(forge::AppEnum)]`
//! macros exist to keep column/value references compile-checked.
//!
//! ```ignore
//! use crate::domain::enums::TopUpStatus;
//! use crate::domain::models::TopUp;
//!
//! impl AdminBadge for PendingTopups {
//!     const KEY: &'static str = "work.pending_topups";
//!     const PERMISSION: Permission = Permission::TopupsManage;
//!     type Watches = TopUp;
//!
//!     fn count(ctx: &AppContext) -> Pin<Box<dyn Future<Output = Result<u64>> + Send + '_>> {
//!         Box::pin(async move {
//!             let db = ctx.database()?;
//!             let n = TopUp::model_query()
//!                 .where_eq(TopUp::STATUS, TopUpStatus::Pending)
//!                 .count(&*db)
//!                 .await?;
//!             Ok(n)
//!         })
//!     }
//! }
//! ```
//!
//! # Flow at a glance
//!
//! ```text
//! TopUp::save → ModelCreatedEvent (snapshot.table = "top_ups")
//!     → BadgeLifecycleListener → dispatcher.queue_recompute(key)
//!     → 250 ms debounce → flush → count() → publish { key, count }
//!     → frontend store update → sidebar re-renders
//! ```

pub mod dev_dummy;

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

/// Erased async count function — takes an `AppContext` and returns the current count.
pub type BadgeCountFn =
    Arc<dyn Fn(AppContext) -> Pin<Box<dyn Future<Output = Result<u64>> + Send>> + Send + Sync>;

/// Type-erased descriptor stored in the registry.
#[derive(Clone)]
pub struct BadgeDescriptor {
    pub key: &'static str,
    pub permission: Permission,
    pub watches_table: String,
    pub count: BadgeCountFn,
}

impl BadgeDescriptor {
    pub fn from_badge<B: AdminBadge>() -> Self {
        Self {
            key: B::KEY,
            permission: B::PERMISSION,
            watches_table: <B::Watches as forge::Model>::table_meta()
                .name()
                .to_string(),
            count: Arc::new(|ctx: AppContext| Box::pin(async move { B::count(&ctx).await })),
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
        self.insert(descriptor)
            .map_err(|e| Error::message(format!("{e} (conflicting impl: {})", type_name::<B>())))
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

use crate::ids::channels as channel_ids;

/// Inner buffer that tracks pending recompute keys. Isolated from
/// `BadgeDispatcher` so its coalescing semantics can be unit-tested without
/// building a real `AppContext`.
#[derive(Default)]
pub struct BadgeDispatchBuffer {
    pending: Mutex<HashSet<&'static str>>,
}

impl BadgeDispatchBuffer {
    pub fn new() -> Self {
        Self::default()
    }

    pub async fn push(&self, key: &'static str) {
        self.pending.lock().await.insert(key);
    }

    pub async fn drain(&self) -> HashSet<&'static str> {
        std::mem::take(&mut *self.pending.lock().await)
    }
}

pub struct BadgeDispatcher {
    registry: Arc<BadgeRegistry>,
    buffer: Arc<BadgeDispatchBuffer>,
    timer_active: Mutex<bool>,
    debounce: std::time::Duration,
    app: AppContext,
}

impl BadgeDispatcher {
    pub fn new(app: AppContext, registry: Arc<BadgeRegistry>) -> Self {
        Self {
            registry,
            buffer: Arc::new(BadgeDispatchBuffer::new()),
            timer_active: Mutex::new(false),
            debounce: std::time::Duration::from_millis(250),
            app,
        }
    }

    pub(crate) fn registry(&self) -> &BadgeRegistry {
        &self.registry
    }

    /// Schedule a recompute for `key`. Bursts coalesce — a single debounce window
    /// may cover many `queue_recompute` calls, after which `flush` runs once per
    /// distinct key.
    pub fn queue_recompute(self: &Arc<Self>, key: &'static str) {
        let this = self.clone();
        tokio::spawn(async move {
            this.buffer.push(key).await;
            let mut active = this.timer_active.lock().await;
            if *active {
                return;
            }
            *active = true;
            drop(active);
            let dispatcher = this.clone();
            tokio::spawn(async move {
                tokio::time::sleep(dispatcher.debounce).await;
                dispatcher.flush().await;
                *dispatcher.timer_active.lock().await = false;
            });
        });
    }

    async fn flush(self: &Arc<Self>) {
        let keys = self.buffer.drain().await;
        for key in keys {
            let Some(descriptor) = self.registry.descriptor(key) else {
                continue;
            };
            let count = match (descriptor.count)(self.app.clone()).await {
                Ok(n) => n,
                Err(err) => {
                    eprintln!("badge count failed; skipping publish (key={key}, error={err})");
                    continue;
                }
            };
            let payload = serde_json::json!({ "key": key, "count": count });
            match self.app.websocket() {
                Ok(publisher) => {
                    if let Err(err) = publisher
                        .publish(
                            channel_ids::ADMIN_BADGES,
                            channel_ids::BADGE_UPDATED,
                            None,
                            payload,
                        )
                        .await
                    {
                        eprintln!("badge publish failed (key={key}, error={err})");
                    }
                }
                Err(err) => {
                    eprintln!(
                        "websocket publisher unavailable; skipping badge publish (error={err})"
                    );
                }
            }
        }
    }
}

use forge::database::{ModelCreatedEvent, ModelDeletedEvent, ModelUpdatedEvent};

/// Bridges Forge's generic model-lifecycle events to the badge dispatcher.
/// Stateless — the dispatcher is resolved lazily per event via the
/// container-backed `AppContext::resolve`.
pub struct BadgeLifecycleListener;

async fn enqueue_for_table(ctx: &EventContext, table: &str) -> Result<()> {
    let dispatcher = ctx.app().resolve::<BadgeDispatcher>()?;
    let keys: Vec<&'static str> = dispatcher.registry().keys_watching(table).to_vec();
    for key in keys {
        dispatcher.queue_recompute(key);
    }
    Ok(())
}

#[async_trait]
impl EventListener<ModelCreatedEvent> for BadgeLifecycleListener {
    async fn handle(&self, ctx: &EventContext, event: &ModelCreatedEvent) -> Result<()> {
        enqueue_for_table(ctx, &event.snapshot.table).await
    }
}

#[async_trait]
impl EventListener<ModelUpdatedEvent> for BadgeLifecycleListener {
    async fn handle(&self, ctx: &EventContext, event: &ModelUpdatedEvent) -> Result<()> {
        enqueue_for_table(ctx, &event.snapshot.table).await
    }
}

#[async_trait]
impl EventListener<ModelDeletedEvent> for BadgeLifecycleListener {
    async fn handle(&self, ctx: &EventContext, event: &ModelDeletedEvent) -> Result<()> {
        enqueue_for_table(ctx, &event.snapshot.table).await
    }
}

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
        reg.insert(make_descriptor("test.a", Permission::AdminsRead, "fakes"))
            .unwrap();
        reg.insert(make_descriptor("test.b", Permission::UsersRead, "fakes"))
            .unwrap();
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
        reg.insert(make_descriptor("test.a", Permission::AdminsRead, "fakes"))
            .unwrap();
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

    #[tokio::test]
    async fn buffer_coalesces_duplicate_keys_and_drains_once() {
        let buffer = BadgeDispatchBuffer::new();
        buffer.push("test.a").await;
        buffer.push("test.a").await;
        buffer.push("test.b").await;

        let drained_first = buffer.drain().await;
        assert_eq!(drained_first.len(), 2);
        assert!(drained_first.contains("test.a"));
        assert!(drained_first.contains("test.b"));

        let drained_second = buffer.drain().await;
        assert!(drained_second.is_empty());
    }
}
