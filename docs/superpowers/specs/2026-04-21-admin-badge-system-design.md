# Admin Badge System — Design

**Date:** 2026-04-21
**Portal:** admin
**Status:** approved (pending user spec review before plan)

## Goal

Render a count badge on each admin sidebar menu item that represents "pending work that needs an admin with the right permission to act on it" — e.g. `Top Ups (1)` when there is one top-up awaiting review. Parent menu items display the aggregated sum of their visible children's badges. Counts update in real time as the underlying domain state changes.

## Concept: work-queue badges, not Forge notifications

This system is deliberately distinct from Forge's built-in `Notification` abstraction.

- **Forge `Notification`** = outbound message delivery to a recipient (email / DB channel / etc.), implemented on top of the Job module. Per-recipient payload.
- **Admin Badge** (this spec) = a real-time count over current domain state, scoped by permission, displayed as a sidebar badge. No per-recipient payload, no message, no delivery, no read/unread state. The "notification" *is* the pending domain row; the system just answers "how many are there?".

Because these are different concepts, naming uses **Badge** throughout — never "notification" — to avoid a lexical collision with `forge::Notification`.

## Scope (v1)

**v1 ships infrastructure only, not concrete badges.** The first feature needing an actual pending-work badge (e.g. top-ups) does not exist in the codebase yet, so no real `impl AdminBadge` modules land here. The deliverable is the framework: trait, registry, dispatcher, REST, WS channel, frontend store, menu renderer. A concrete badge is registered only if needed as a smoke test (see Testing).

- Declare a badge as `impl AdminBadge for T` in one file
- Register once in a service provider
- Reference by string key in `MenuItem.badge` on the sidebar
- Admin-portal only
- Per-admin WebSocket channel, permission-filtered on both REST and WS push
- Auto-recompute on domain mutation via a model observer declared by the badge's `type Watches`
- Debounced pushes (coalesce bursts)
- Parent menu aggregation computed on the frontend

### Non-goals (v1)

- Per-admin inbox / message stream (use `forge::Notification` for that)
- Read / unread state, history, timeline
- Multi-permission badges (single permission per badge)
- Per-badge debounce override
- Tenant / org scoping of counts (starter has no multi-tenancy today)
- Server-side badge push to email / mobile
- Redis caching of counts (recompute on each debounced flush)
- User-portal badges
- Click-to-drill-into-filtered-list UX (separate feature concern)

## Key naming convention

All badge keys are namespaced dot-form strings:

```
work.pending_topups
work.pending_kyc
```

`work.*` is the only namespace in v1. Reserving a namespace prefix leaves room for future categories (`inbox.*`, `alert.*`) without rewriting existing keys. The `work.` prefix conveys "item needs action".

## Architecture

```
BOOT
  BadgeServiceProvider registers each impl AdminBadge.
  For each, wires a model observer on `type Watches`.

ADMIN LOGIN
  REST  GET /api/v1/admin/badges
    → backend filters by admin's effective permissions
    → returns { "work.pending_topups": 3, "work.pending_kyc": 1 }
  adminBadgeStore.hydrate(counts)
  WS    subscribe admin:badges  (single shared channel)

DOMAIN MUTATION  (e.g., TopUp save/delete)
  Forge model observer fires
  → BadgeDispatcher.queue_recompute(affected badge keys)
  → 250 ms debounce coalesces bursts
  → flush: for each key in pending set:
       count = Badge::count(ctx)           // computed once per key
       ws.publish("admin:badges", { key, count })
       broker fans out to all subscribed admins; each client filters by known keys

FRONTEND RECEIVES
  adminBadgeStore.set(key, count)
  Sidebar re-renders (reactive via useSyncExternalStore)
  Parent displayed count = own (if any) + Σ visible children (recursive)
```

## Backend

### `AdminBadge` trait

One file per badge under `src/domain/badges/`. Shape:

```rust
// src/domain/badges/pending_topups.rs
use async_trait::async_trait;
use forge::Result;

use crate::{
    domain::badges::AdminBadge,
    domain::models::TopUp,
    ids::permissions::Permission,
};

pub struct PendingTopups;

#[async_trait]
impl AdminBadge for PendingTopups {
    const KEY: &'static str = "work.pending_topups";
    const PERMISSION: Permission = Permission::TopupsManage;

    type Watches = TopUp;

    async fn count(ctx: &AppContext) -> Result<u64> {
        TopUp::query().where_eq("status", "pending").count().await
    }
}
```

Required surface:
- `KEY` — globally unique namespaced string, used by REST/WS/frontend
- `PERMISSION` — single `Permission` variant (admins with this permission see the badge)
- `type Watches` — the `forge::Model` whose mutations trigger a recompute for this badge
- `async fn count(ctx) -> Result<u64>` — the live query

### Registry and dispatcher

```
src/domain/badges/
  mod.rs            // AdminBadge trait, BadgeRegistry, BadgeDispatcher, observer bridge
  pending_topups.rs // first concrete impl — introduced when the top-up feature lands
```

- `BadgeRegistry` — map from `KEY` to a registered badge descriptor (type-erased count fn, permission, watched model type id). Built during provider registration.
- `BadgeDispatcher` — owns a `HashSet<&'static str>` debounce buffer behind an async mutex and a 250 ms timer. Public API:
  - `queue_recompute(key: &'static str)` — add to buffer; start timer if idle.
  - `flush()` (internal) — drain buffer; for each key, iterate connected admins, check permission, compute, push.
- **Model observer bridge** — on provider registration, for each badge `B`, install a model observer on `B::Watches` that calls `dispatcher.queue_recompute(B::KEY)` on every save/delete.

### Forge model observer — implementation caveat

The exploration pass found no generic "model saved" event. Two options at implementation time, **DX is identical either way**:

1. **Generic observer primitive** — add a thin `Model::observe(|change: ModelChange<T>| ...)` hook on top of `forge::Model`'s save/delete, subscribed to by the registry. Preferred; keeps the trait shape with `type Watches = TopUp`.
2. **Explicit domain events fallback** — if adding a generic hook is not feasible in v1, the trait becomes `const WATCHES: &[EventId]` and the developer fires domain events (e.g. `TopUpCreated`, `TopUpStatusChanged`) from services. External DX still one file per badge.

Plan-writing step should verify whether `forge::Model` exposes lifecycle hooks and pick the simpler path.

### Service provider

```rust
// src/providers/badge_service_provider.rs
pub struct BadgeServiceProvider;

impl ServiceProvider for BadgeServiceProvider {
    async fn register(&self, registrar: &mut ServiceRegistrar) -> Result<()> {
        registrar.register_badge::<PendingTopups>()?;
        // future:
        // registrar.register_badge::<PendingKyc>()?;
        Ok(())
    }
}
```

Provider wired into `src/bootstrap/http.rs` and `src/bootstrap/websocket.rs` (both processes need it — HTTP to serve the REST endpoint, WebSocket to publish pushes). Scheduler/worker do not need the registry.

### REST endpoint

Route: `GET /api/v1/admin/badges` — thin handler in `src/portals/admin/badge_routes.rs`, `Guard::Admin`, tag `admin:badges`.

Response shape:

```json
{ "work.pending_topups": 3, "work.pending_kyc": 1 }
```

Semantics:
- Includes **every key the admin has permission for**, even counts of `0`. Lets the frontend hydrate a complete snapshot.
- Counts are computed on-demand (no caching in v1). For ~10–30 admin badges the aggregate DB load is negligible compared to operator traffic.
- Handler delegates to `badge_service::current_counts(ctx, admin)` in `src/domain/services/badge_service.rs` — portal-less, permission-aware.

### WebSocket channel

Channel: `admin:badges` — **single shared channel** for all admins. Mirrors the pattern used by the existing `admin:presence` channel.

**Why shared instead of per-admin or per-key:** badge counts are low-sensitivity aggregate metrics — each payload is literally `{key, count}` with no PII, user identifiers, or business specifics. The cost of scoping channels by permission (more subscriptions per admin, or per-key authorization plumbing) isn't justified when the payload itself isn't secret. All connected admins receive every update; filtering happens in the browser. If a future badge tracks a genuinely sensitive aggregate, it can be introduced on a separate scoped channel without rewriting this one.

Registration lives in `src/realtime/mod.rs`. Channel ID added to `src/ids/channels.rs`:

```rust
pub const ADMIN_BADGES: ChannelId = ChannelId::new("admin:badges");
```

Authorization: `Guard::Admin` only — any authenticated admin can subscribe. No per-key auth on the WS path; the REST endpoint remains the authoritative permission filter (it only returns keys the admin has permission for, and the frontend uses that set as its allowlist for WS updates).

Push payload (single-key delta):

```json
{ "event": "badge:updated", "payload": { "key": "work.pending_topups", "count": 4 } }
```

The key is in the payload since the channel is shared. Event name `badge:updated` leaves room for future events (`badge:cleared`, etc.).

### Dispatch flow (detailed)

1. Domain mutation (e.g., `TopUp` is saved).
2. Registry's observer for `TopUp` fires; it calls `dispatcher.queue_recompute(key)` for every registered badge whose `type Watches` is `TopUp` — in v1, just `work.pending_topups`.
3. Dispatcher adds the key to its pending set; if no timer is running, it starts a 250 ms timer.
4. On timer fire, dispatcher drains the set and flushes. **For each drained key:**
   - Look up the badge descriptor in the registry.
   - Compute `descriptor.count(ctx)` exactly once.
   - Publish `{ key, count }` to `admin:badges`.
   - The broker fans out the message to every connected admin. Each client discards updates for keys it doesn't care about (its allowlist = keys returned by the initial REST snapshot).
5. Failure in `count()` is logged and skipped; the previous value remains in the frontend store. Next mutation retries.

Dispatch work is O(#affected_badges) — independent of admin count.

### Concurrency

Dispatcher uses async mutex on the pending set and a `tokio::time::sleep`-driven timer. Recompute happens on the dispatcher task, not on the caller of `queue_recompute`. Model observers are therefore non-blocking for write paths.

## Frontend

### Field rename on `MenuItem`

```ts
// frontend/admin/src/config/side-menu.ts
export type MenuItem = {
    key: string;
    label: string;
    icon?: LucideIcon;
    path?: string;
    permission?: Permission;
    adminTypes?: readonly AdminType[];
    badge?: string;                // was `notification?: string` — unused, rename is free
    children?: MenuItem[];
};
```

The old `notification?: string` field is removed. No call sites exist.

### Store

```ts
// frontend/admin/src/stores/badgeStore.ts
import { createStore, useStore } from "@shared/store";

type BadgeState = {
    counts: Record<string, number>;
    loaded: boolean;
};

const badgeStore = createStore<BadgeState>({ counts: {}, loaded: false });

export const adminBadges = {
    hydrate(counts: Record<string, number>) {
        badgeStore.setState({ counts, loaded: true });
    },
    set(key: string, count: number) {
        badgeStore.setState((prev) => ({
            counts: { ...prev.counts, [key]: count },
        }));
    },
    knows(key: string): boolean {
        // Allowlist check — key was returned by the initial REST snapshot
        return key in badgeStore.getState().counts;
    },
    reset() {
        badgeStore.setState({ counts: {}, loaded: false });
    },
};

export function useBadge(key?: string): number {
    return useStore(badgeStore, (s) => (key ? (s.counts[key] ?? 0) : 0));
}

export function useBadgeSum(keys: string[]): number {
    return useStore(badgeStore, (s) =>
        keys.reduce((acc, k) => acc + (s.counts[k] ?? 0), 0),
    );
}
```

Pattern mirrors `@shared/config`'s `runtimeStore` — the store is admin-shared, not feature-local.

### WS wiring

In `frontend/admin/src/websocket.ts`, after admin auth check:

1. On successful auth, call `GET /api/v1/admin/badges`; on success, `adminBadges.hydrate(response)`. The keys returned form the admin's permitted-key allowlist for this session.
2. Subscribe once to the shared channel: `ws.subscribe("admin:badges")`.
3. Register one handler that filters by the allowlist:
   ```ts
   ws.on("admin:badges", "badge:updated", ({ key, count }) => {
       if (!adminBadges.knows(key)) return;   // not in initial snapshot → discard
       adminBadges.set(key, count);
   });
   ```
   The store's `knows(key)` check uses the snapshot-derived allowlist. Unknown keys are silently dropped — the admin shouldn't (and won't) see counts for badges they don't have permission for, because the backend never returned those keys in the snapshot.
4. On WS reconnect (use existing status hook), refetch REST snapshot and re-hydrate. Allowlist is rebuilt in the process, covering any newly-returned keys.
5. On logout, `adminBadges.reset()` and unsubscribe from `admin:badges`.

### Menu aggregation

Single renderer helper in `frontend/admin/src/components/sidebar/`:

```ts
function getBadgeCount(
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

Rules:
- **Additive**: parent's rendered count = own badge (if set) + sum of visible children (recursive).
- **Visibility filter**: uses the existing admin permission + admin-type check from `adminAccess.ts` so a child the admin cannot see contributes `0`. Prevents leaking count information via parent badge.
- **Zero → no badge rendered**.

### Badge component

Shared pill component in `frontend/admin/src/components/sidebar/badge.tsx` (or promoted to `@shared/components` if the user portal later needs one). Minimal styling:

- Inline-flex, centered, red background, white text
- `min-width` sized for a single digit
- `99+` clamp when `count > 99`
- Returns `null` when `count <= 0`
- Obeys CLAUDE.md primitive rule: if ever made clickable, use `Button unstyled` rather than `<button>` directly

No translatable text — numeric only. `99+` is a literal ASCII clamp; no i18n needed.

## Permissions — layered, not defense-in-depth

Because the WS channel is shared, permission filtering happens in two places but with different roles:

1. **Backend REST** (authoritative for allowlist): `GET /admin/badges` only returns keys the admin has permission for. This is the one and only permission gate for badge visibility; it defines the admin's allowlist for the session.
2. **Frontend** (enforcement + UX):
   - Store only stores keys from the initial snapshot. WS deltas for unknown keys are discarded (`adminBadges.knows(key)` check).
   - Existing `MenuItem.permission` / `MenuItem.adminTypes` hides menu items entirely. Hidden children contribute 0 to parent aggregation.

Accepted trade-off: all admins receive all badge deltas over the wire. Since counts are aggregate metrics with no identifying or business-sensitive payload, this is treated as acceptable information exposure — the same class as metrics dashboards an internal operator could infer from traffic patterns anyway. If a future badge tracks a sensitive aggregate, introduce it on a separate scoped channel at that time.

## Edge cases

| Case | v1 behavior |
|------|-------------|
| Admin's permissions are revoked mid-session | Cached counts stay visible until next page load / reconnect. Documented limitation. |
| `count()` throws | Log error, skip push, keep last known frontend value. Next mutation retries. |
| WS disconnects | On reconnect, frontend refetches REST snapshot. Covers missed deltas. |
| High mutation rate | 250 ms debounce coalesces. Beyond that: future work. |
| Menu key references a backend key that doesn't exist | Store lookup returns `0`, badge hidden. No error. |
| `Permission` enum variant removed | Badge referencing it fails to compile. Desired — forces cleanup. |
| Admin is a Developer/SuperAdmin (all permissions) | Receives every badge's count. Same code path — permission check returns true. |
| No registered badges at all | REST returns `{}`, store hydrates empty, no WS pushes, no-op. |

## Files

### New

- `src/domain/badges/mod.rs` — trait, registry, dispatcher, observer bridge
- `src/domain/badges/pending_topups.rs` — **placeholder example only**; actual badge modules are created when their underlying feature lands
- `src/domain/services/badge_service.rs` — `current_counts(ctx, admin)` portal-less service
- `src/providers/badge_service_provider.rs` — registration
- `src/portals/admin/badge_routes.rs` — thin REST handler
- `frontend/admin/src/stores/badgeStore.ts` — store + `useBadge` / `useBadgeSum`
- `frontend/admin/src/components/sidebar/badge.tsx` — pill component
- `frontend/admin/src/components/sidebar/get-badge-count.ts` — aggregation helper

### Modified

- `src/ids/channels.rs` — add `ADMIN_BADGES` (single channel constant)
- `src/realtime/mod.rs` — register `admin:badges` channel with `Guard::Admin`
- `src/portals/admin/mod.rs` — wire `GET /badges` route
- `src/bootstrap/http.rs` — register `BadgeServiceProvider`
- `src/bootstrap/websocket.rs` — register `BadgeServiceProvider`
- `frontend/admin/src/config/side-menu.ts` — rename `notification?: string` → `badge?: string`
- `frontend/admin/src/websocket.ts` — hydrate + subscribe + filtered listener + reset on auth/reconnect/logout
- `frontend/admin/src/components/sidebar/menu-item.tsx` (or equivalent) — use aggregation helper + badge component

### Removed

- The unused `notification?: string` field on `MenuItem` (replaced by `badge?: string`).

## Testing

Because v1 ships no real badge, verification relies on an infrastructure smoke test:

- Register a trivial test badge (e.g. `DevDummyBadge` counting a hard-coded or test-fixture value) behind a `#[cfg(test)]` flag, or in a developer-only provider enabled by env var.
- Integration test: log in as a developer admin → `GET /admin/badges` returns the dummy key → assert WS push arrives when a listened-to model is saved → assert value in frontend store updates.
- Frontend component test for aggregation helper: parent + visible-children sum, hidden child contributes `0`, zero-total hides the badge.
- Manual smoke: `make dev`, log in, observe badge lifecycle end-to-end.

No persistent real badge is introduced by this change. The first production badge is added with its owning feature (e.g. top-up module).

## Open implementation questions (decide during plan)

1. Does `forge::Model` expose a generic save/delete lifecycle hook? If yes, `type Watches = TopUp` auto-observer is a ~50-line bridge. If no, fall back to `const WATCHES: &[EventId]` and require explicit domain events.

This is the only remaining framework-level question. The previous questions about parameterized channel names and per-connection authorizers are moot — the revised shared-channel design uses only the primitives already exercised by `admin:presence`.

The external DX (`impl AdminBadge`, one-line provider registration, `MenuItem.badge` field) does not change regardless of which fallback is chosen.
