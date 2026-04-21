---
name: admin-badge
description: Use when adding a new admin-portal sidebar badge — a pending-item count indicator such as "pending topups", "pending KYC", "unreviewed withdrawals", or any "show count on admin menu" request. Covers the full cross-layer flow: backend AdminBadge trait file + BadgeServiceProvider registration + frontend MenuItem wiring. Do NOT use for Forge user notifications (outbound messages delivered to users), dashboard metrics / charts, or generic global-state counters unrelated to admin work queues.
---

# Admin Badge — add a new work-queue count indicator

## When to invoke

A user asks to add a pending-item count indicator to the admin sidebar. Typical phrasings:

- "add a pending topups badge"
- "show a count on the admin menu when there's pending KYC"
- "badge for unreviewed withdrawals"
- "notification count for X on admin sidebar"

Do NOT invoke for:
- Forge user-facing notifications (outbound message delivery — that's `forge::Notification`, a different system)
- Dashboard metrics, charts, KPI tiles — those are standalone widgets, not sidebar badges
- Counts not tied to admin action (e.g., "total users ever") — badges are for *pending work*, not summaries

## Concept (one paragraph)

An admin badge answers *"how many items need an admin with permission P to act on them?"*. Each badge is a live count over current domain state, permission-filtered. Forge's `ModelCreated/Updated/Deleted` events fire automatically on any watched-model mutation → `BadgeLifecycleListener` enqueues a debounced recompute → `BadgeDispatcher` publishes `{key, count}` to the shared `admin:badges` WebSocket channel → admin browsers with the key in their REST-snapshot allowlist update their store → sidebar re-renders. Zero manual publish calls.

**Deeper references** (read only if the flow below is unclear):
- CLAUDE.md: "Admin Badge System" section
- Module docstring: `src/domain/badges/mod.rs` (top of file)

## Prerequisites

Before writing badge code, verify each of these exists. If any is missing, build it first — don't paper over gaps:

- [ ] **The model the badge watches** — e.g., `TopUp` at `src/domain/models/top_up.rs`, declared with `#[derive(forge::Model)]` and an appropriate `#[forge(model = "...")]` table name. The macro must expose column constants (e.g., `TopUp::STATUS`).
- [ ] **The permission that gates visibility** — a variant of `Permission` in `src/ids/permissions.rs`. If you need a new one, add it with a unique `#[forge(key = "...")]` and regenerate types (`make types`).
- [ ] **The state enum you're filtering on** — e.g., `TopUpStatus` in `src/domain/enums/`, with `#[derive(forge::AppEnum)]`. Never filter by a raw string.
- [ ] **The menu item that will display the badge** — an entry in `frontend/admin/src/config/side-menu.ts`. Create one if missing (paired with the relevant page route).

## Steps

### 1. Create the badge file

Path: `src/domain/badges/<snake_case_name>.rs`

Template (replace every `<...>` placeholder):

```rust
use std::future::Future;
use std::pin::Pin;

use forge::prelude::*;

use crate::domain::badges::AdminBadge;
use crate::domain::enums::<YourEnum>;
use crate::domain::models::<YourModel>;
use crate::ids::permissions::Permission;

pub struct <YourBadge>;

impl AdminBadge for <YourBadge> {
    const KEY: &'static str = "work.<your_key>";
    const PERMISSION: Permission = Permission::<YourPermission>;
    type Watches = <YourModel>;

    fn count(ctx: &AppContext) -> Pin<Box<dyn Future<Output = Result<u64>> + Send + '_>> {
        Box::pin(async move {
            let db = ctx.database()?;
            let n = <YourModel>::model_query()
                .where_eq(<YourModel>::<COLUMN>, <YourEnum>::<Variant>)
                .count(&*db)
                .await?;
            Ok(n)
        })
    }
}
```

**Strongly-typed rules (enforce these):**
- `KEY` is namespaced: `work.*` for pending-action queues. Reserved: `inbox.*` for future per-admin message streams, `alert.*` for future alerts. Never collide.
- Use macro-generated column constants (`TopUp::STATUS`), NEVER `.where_eq("status", ...)`.
- Use typed enum variants (`TopUpStatus::Pending`), NEVER raw string values.
- `type Watches` is the model whose lifecycle events should trigger recomputes. Tuple types / multi-model watches are not supported in v1 — if a badge truly depends on two models, split into two badges or file a plan change.

### 2. Export the module

Edit `src/domain/badges/mod.rs` — add `pub mod <snake_case_name>;` alongside the existing `pub mod dev_dummy;` line.

### 3. Register with the provider

Edit `src/providers/badge_service_provider.rs` — inside `register_all_badges`, add:

```rust
registry.register::<crate::domain::badges::<snake_case_name>::<YourBadge>>()?;
```

Keep registrations grouped and ordered however the file already orders them. Do not add conditional gates unless the badge is dev-only (see `DevDummyBadge` for the pattern).

### 4. Wire to the admin sidebar

Edit `frontend/admin/src/config/side-menu.ts` — on the relevant `MenuItem`, add:

```ts
{
  key: "...",
  label: "...",
  path: "/admin/...",
  permission: "...",       // admin-side permission check (separate from backend)
  badge: "work.<your_key>", // ← match the KEY from step 1 exactly
}
```

**Parent aggregation is automatic.** If the badge is on a child menu item, the parent's displayed count becomes `parent_own_badge + Σ visible children badges`. No extra config needed.

## Verify

Run in order:

```bash
make check        # cargo check
make lint         # cargo clippy -D warnings + Biome
make types        # regenerate TS bindings (no new DTOs here, but keeps surface clean)
cargo test --lib domain::badges    # 4 existing unit tests still pass
```

All four must be clean. If `make lint` flags new warnings in the new badge file, fix at the source — don't suppress.

**Optional end-to-end smoke** (requires local Postgres + Redis):

```bash
export APP__BADGES__DEV_DUMMY=true  # optional — adds the generic smoke badge too
make dev
```

Log in as developer admin, navigate to the menu item, verify the badge renders. Trigger a state change (e.g., create a pending row via the admin UI or a CLI seed) — badge should update within ~250 ms. If it doesn't, check: (a) is the WS process running (`make dev` starts it); (b) does the admin have `PERMISSION`; (c) is the key string in step 4 exactly equal to `KEY` in step 1.

## Don't

- **Don't manually `app.websocket()?.publish(...)` after a model mutation.** The lifecycle listener handles it. Direct publishes bypass debouncing and permission filtering.
- **Don't duplicate the count query** in a REST handler or a frontend hook. The single `count()` function drives REST (`GET /admin/badges`) and WS pushes. One source of truth.
- **Don't cache counts in Redis or in-memory.** The dispatcher recomputes on each flush. Caching is out of scope for v1; if perf becomes an issue, extend `BadgeDispatcher` rather than adding parallel caches.
- **Don't use stringly-typed columns or values.** The derive macros exist specifically to prevent this.
- **Don't register a production badge behind a env-var gate.** `APP__BADGES__DEV_DUMMY` gating is for `DevDummyBadge` only. Real badges are always registered.
- **Don't skip the permission field.** Every badge has a single `PERMISSION`. Multi-permission badges (visible if admin has either of two) aren't supported in v1.

## When this skill doesn't fit

If the user asks for something adjacent but different, route appropriately:

- **"Add a new admin permission"** → create `Permission::<Name>` in `src/ids/permissions.rs`, regenerate types, then invoke this skill if the goal is a badge.
- **"Show user-facing notifications / messages"** → that's `forge::Notification`; do NOT treat as a badge.
- **"Add a dashboard widget"** → separate concern, not a sidebar badge.
- **"Count that updates on a timer, not on model changes"** → extend `BadgeDispatcher` with a cron-driven recompute path (requires a design update); escalate rather than hack.
