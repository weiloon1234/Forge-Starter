---
name: new-module
description: Use when adding an entirely new feature module to the starter — a vertical slice that typically spans model + migration + permissions + admin UI + routes + optional badge + optional event reactions + optional jobs / notifications + i18n. Typical phrasings: "add a top-ups module", "new kyc feature with pending review workflow", "withdrawals module with admin approval", "wishlist feature", "blog post module with CRUD", "coupon code system". This is the **Tier-3 orchestrator**: it doesn't duplicate templates, it sequences invocations of the narrower skills (`new-permission`, `new-model`, `admin-datatable`, `admin-badge`, `new-event-listener`, `jobs-and-notifications`, etc.) in a decision-driven order so the dependencies fall out correctly. Do NOT use for: adding a single route to an existing module (→ `new-route`); adding a single page (→ `admin-page` / `admin-datatable`); renaming / deleting an existing module (schema change — escalate); architectural refactors that reshape multiple existing modules (case-by-case, not skill-worthy); modules that are purely frontend (no backend model) — those are regular page work via `admin-page`.
---

# New Module — orchestrate a complete feature across backend + frontend

## When to invoke

A developer is starting a new feature that spans schema, backend logic, admin UI, and (usually) at least one of badge / events / jobs / notifications. Typical phrasings:

- "add a top-ups module with admin approval flow"
- "new KYC feature — users submit, admins review"
- "withdrawals feature — user-initiated, admin-approved"
- "blog posts with create/edit/publish/delete + public listing"
- "coupon code system with generate / redeem / expire"
- "support tickets module"
- "referral program module"

Do NOT invoke for:
- **A single route, page, or component** — use the targeted skill (`new-route`, `admin-page`, `admin-datatable`, etc.).
- **Renaming or deleting an existing module** — schema-breaking; out of skill scope.
- **Multi-module refactors** (e.g., "unify credits and wallets") — judgment call per change; not skill-worthy.
- **Pure frontend modules with no backend** — that's `admin-page` or routine page work.
- **Cross-cutting infrastructure changes** (switch auth driver, change database engine, change caching layer) — framework-level; escalate.

## Concept

A "module" here is a **vertical slice**: everything needed for one feature to work end-to-end. Adding `TopUps` to this starter typically means:

- `TopUp` model (struct + migration + optional seeder)
- `TopupsRead` + `TopupsManage` permissions
- Admin CRUD page (list + create/edit/delete modals)
- (Optional) Pending-topups sidebar badge
- (Optional) Event listener that reacts to status changes
- (Optional) Jobs / notifications for downstream effects (email on approval, etc.)
- i18n keys for every user-visible string
- TypeScript types regenerated for all new DTOs

This skill is the **Tier-3 orchestrator**: it does not hold templates of its own; it decides which Tier-1 / Tier-2 skills to invoke in what order. Each sub-skill still owns its canonical procedure; this skill's job is sequencing, dependency management, and preventing you from skipping steps.

**Why orchestration matters**: sub-skills have dependencies.

- `new-permission` must come before routes that gate on it
- `new-model` must come before a datatable / badge / event listener that references the model
- `admin-datatable` assumes the model + permissions exist
- `admin-badge` assumes the model's lifecycle events fire (they do automatically once the model exists)
- `new-event-listener` listens for events; if the event is a Forge `ModelCreatedEvent`, the model must exist first

Getting the sequence wrong wastes time (type errors mid-flow, half-wired features). This skill pins the correct order.

## Prerequisites

- [ ] The module's conceptual design is clear — you can name the tables, describe the main user flows, list the permission distinctions, and identify any downstream side-effects.
- [ ] The model(s) this module introduces don't conflict with existing ones (no duplicate table names or enum clashes).
- [ ] Any shared primitives the module depends on — enums, Forge primitives — either exist or are covered by existing skills to create them.

## Decisions — answer all before writing code

A module touches many layers; the decision count is proportional. Walk the user through each axis. Don't proceed until every answer is locked.

### 1. Core identity

- **Module name** — PascalCase for the primary model (`TopUp`, `Withdrawal`, `KycSubmission`), snake_case plural for the table (`top_ups`, `withdrawals`, `kyc_submissions`), and a URL slug (`/top-ups`, `/withdrawals`, `/kyc`).
- **Scope** — admin-portal only, user-portal only, or both? Most business modules are both (users create records; admins review / approve).

### 2. Data shape

- **Primary model(s)** — usually one, sometimes more (pivot tables, translations, audit records).
- **Fields** — columns + types. Any enum-typed fields (need to exist in `src/domain/enums/` first)?
- **Foreign keys** — what does this model reference? User? Admin? Another new module?
- **Soft delete?** — usually yes for business records; no for immutable ledger entries.
- **Seeder?** — dev data seeded or not?

### 3. RBAC

- **Permissions** — typically two (`<module>.read`, `<module>.manage`); sometimes more (`<module>.approve`, `<module>.export`).
- **Implied permission chain** — `.manage` usually implies `.read`.
- **Fine-grained route gating** — are any specific routes more restricted than the scope default (e.g., `/approve` requires a custom `<module>.approve` perm)?

### 4. Admin UI

- **List page** — yes (→ `admin-datatable`) or no (read-only module: an export or metric-only resource).
- **Custom columns** — any computed / joined / formatted columns beyond the model's direct fields?
- **Filters** — text search, enum dropdowns, date ranges?
- **Form modals** — standard create+edit (`admin-datatable` handles) or custom multi-step (→ `frontend-form` Variant D)?
- **Row actions** — default edit/delete, or custom (approve/reject, retry, etc.)?
- **Detail page** — navigate from row into a full page, or all work happens in modal? (`admin-page` for detail pages.)

### 5. User UI (if user-portal scope is yes)

- **List view** — user's own records, paginated?
- **Create / submit form** — user-facing form to create records (`frontend-form` Variant B for page forms)?
- **Status display** — how does the user see the progression (pending / approved / rejected)?

### 6. Real-time

- **Sidebar badge** — is there a pending count admins should see? → `admin-badge` after the model lands.
- **WebSocket push** — beyond badges, does the admin need real-time status updates? Real-time work is an edge case; defer unless required.

### 7. Side effects

- **Event listeners** — does anything react to this model's lifecycle (e.g., when a TopUp is approved, credit the user's balance; when a KYC is submitted, notify admins)? → `new-event-listener`.
- **Jobs** — is there async work triggered by the module (send confirmation email, compute something expensive)? → `jobs-and-notifications`.
- **Notifications** — are recipients informed over multiple channels (email + in-app + push)? → `jobs-and-notifications`.

### 8. i18n

- **Translation keys** — every user-visible string on admin + user sides. Namespace: `admin.<module>.*` and `user.<module>.*` (or `<module>.*` if shared).
- **Enum label keys** — for any `forge::AppEnum` used in this module, `enum.<snake_name>.<variant>` keys must exist in every locale.

### 9. External dependencies

- **Third-party APIs** — does the module call Stripe, a KYC provider, an email / SMS service? List them.
- **Webhooks** — does the module receive inbound callbacks? → `new-route` with `.public()` + signature verification.
- **Config** — are there module-specific settings that go in `config/<module>.toml` + `.env` overrides?

Present every answer to the user. Confirm. THEN start the orchestration.

## Orchestration — the canonical sequence

The order below minimizes rework. Skip steps based on the decisions above; never reorder. Each bullet points at the sub-skill that owns the step.

### Phase A — Foundations (backend, pre-UI)

1. **(If new enum variants needed)** — Create any `src/domain/enums/<name>.rs` files with `#[derive(forge::AppEnum)]` + add `enum.<snake_name>.<variant>` i18n keys in every locale. No skill yet; pattern in CLAUDE.md's enum rules + `typescript` skill.
2. **(If new permissions needed)** — Invoke `new-permission` once per variant (typically `.read` + `.manage`). Run `make types` after the last one.
3. **Invoke `new-model`** — Create the primary model with migration (via `make:model` + `make:migration`). This must come before anything that references the model (datatable, badge, event listener).
4. **(If seeder needed)** — Follow the seeder variant in `new-model` (`make:seeder`). Often deferred until the module is working.

**After Phase A**: `make check && make lint && make types`. Model queryable; permissions registered; TS types generated.

### Phase B — Backend API surface

5. **(If module needs non-default middleware)** — consult `middleware` skill BEFORE writing routes. Decide whether the module's routes need a group (`api` for rate limits, `web` for CSRF + security headers) or per-route config (stricter rate limit on auth-adjacent actions, larger body size for uploads, longer timeout for exports). Apply via `.middleware_group(...)` at scope level or `route.rate_limit(...)` / similar per-route.
6. **Routes**:
   - Standard CRUD → step 8's `admin-datatable` handles this inline (skip to Phase C).
   - Custom action / workflow routes (approve, reject, retry, bulk) → invoke `new-route` per action.
   - Webhooks → invoke `new-route` with `.public()` + signature verification + usually tighter rate-limit middleware.
7. **Request / response DTOs** — land alongside the routes (part of `admin-datatable` / `new-route` flow).
8. **Service layer** — `src/domain/services/<module>_service.rs` with the business functions called by routes. Per CLAUDE.md: portals are THIN; services hold logic. This typically grows out of the skills above — no separate skill.

**After Phase B**: `make types` once more for any custom-action DTOs. `make check`. Routes callable via curl.

### Phase C — Admin UI (if applicable)

8. **List / CRUD page**:
   - Standard CRUD (list + create/edit/delete modals) → invoke `admin-datatable`. Covers backend datatable definition, routes, frontend page, modals, menu, i18n end-to-end.
   - Custom approval-workflow list (no create/edit but per-row approve/reject) → `admin-datatable`'s "Approval workflow" variant + `new-route` for the action endpoints.
9. **Detail page** (if a row needs a dedicated URL instead of a modal) → invoke `admin-page` (Detail view variant).
10. **Dashboard / report** (if the module has aggregate views) → invoke `admin-page` (Dashboard or Report variant).

**After Phase C**: `make dev` smoke — admin can log in, see the menu item, open the list, perform the CRUD / actions.

### Phase D — Real-time + reactions

11. **(If pending count badge needed)** — Invoke `admin-badge`. Requires the model to exist (Phase A) and the permission for visibility (Phase A step 2).
12. **(If event listener needed)** — Invoke `new-event-listener`. The trigger is usually a domain event OR one of Forge's generic `ModelCreated/Updated/DeletedEvent`. The listener dispatches jobs or notifications.
13. **(If jobs / notifications needed)** — Invoke `jobs-and-notifications`. Covers both the async work and user-facing delivery.

**After Phase D**: `make dev` smoke — perform a user action; watch the badge update, check the listener fires (log line / DB row), verify the job runs and notification delivers.

### Phase E — User UI (if user-portal scope)

14. **User-facing pages** — no dedicated skill yet for user-portal pages. Adapt from `admin-page` by copying the pattern into `frontend/user/src/pages/` and using `frontend/user`'s existing auth + api instances. If the user-portal work surfaces a real pattern more than once, promote to a `user-page` skill.
15. **User-facing forms** — invoke `frontend-form` (portal-agnostic). Page forms for user-initiated submission; modal confirms for destructive actions.

**After Phase E**: `make dev` smoke — user can log in, perform their flow, see the record's progression.

### Phase F — Final polish

16. **i18n completeness** — every `admin.<module>.*` and `user.<module>.*` key used by code must exist in every locale file (`locales/en/messages.json`, `locales/zh/messages.json`, etc.). CLAUDE.md hard rule.
17. **`make check && make lint && make types`** — green across the board.
18. **Manual smoke across roles** — developer admin (sees everything), admin with only `<module>.read` (sees list, can't edit), admin without any permission (menu item hidden), user (user-side flow works).
19. **(Optional) Integration test** — if the module has a non-trivial flow, add an integration test under `tests/` mirroring `tests/user_baseline.rs`. Skip for simple CRUD.

## Typical orderings by module shape

### Shape 1 — Standard admin CRUD module (80% case)

Example: **Blog Posts** — admins create/edit/delete, no user-side, no approval workflow, no side effects.

Order:
1. `new-permission` × 2 (`posts.read`, `posts.manage`)
2. `new-model` — `Post` struct, migration
3. `admin-datatable` — list page + CRUD modals + menu + i18n
4. Done.

### Shape 2 — Approval workflow module

Example: **Withdrawals** — users initiate, admins approve/reject, event listener credits balance on approval, notification on status change.

Order:
1. Enum — `WithdrawalStatus` in `src/domain/enums/` (pending / approved / rejected)
2. `new-permission` × 2 (`withdrawals.read`, `withdrawals.manage`)
3. `new-model` — `Withdrawal` struct, migration
4. `admin-datatable` — list page with row-level approve/reject buttons (Approval-workflow variant)
5. `new-route` × 2 — `POST /admin/withdrawals/{id}/approve`, `POST /admin/withdrawals/{id}/reject`
6. `admin-badge` — pending-withdrawals count
7. `new-event-listener` — listens to `WithdrawalStatusChanged` domain event
8. `jobs-and-notifications` — `WithdrawalApproved` notification (email + in-app)
9. User-portal form — `frontend-form` Variant B for the "submit withdrawal" page
10. Done.

### Shape 3 — Pure backend / webhook module

Example: **Stripe integration** — receives webhooks, dispatches jobs to sync state, no direct UI.

Order:
1. `new-route` — `POST /webhooks/stripe` (`.public()`, signature-verified)
2. Services + jobs — service function calls model builders; dispatches `jobs-and-notifications`
3. (Optional) admin debugging page — `admin-page` Viewer variant for the Stripe event log
4. Done.

### Shape 4 — User-facing feature with admin oversight

Example: **Support Tickets** — users create + message, admins respond + close, notifications on reply.

Order:
1. `new-permission` × 2 (`tickets.read`, `tickets.manage`)
2. `new-model` × 2 — `Ticket` + `TicketMessage` (with relations)
3. `admin-datatable` — admin list + detail page for tickets
4. User-side list + detail page — `frontend-form` + adapted admin-page pattern in `frontend/user/`
5. `new-event-listener` — reacts to new ticket / new message
6. `jobs-and-notifications` — notify admin on new user ticket; notify user on admin reply
7. Done.

## Verification checkpoints

Run between sub-skill invocations:

- After each `make:model` / `make:migration` → `make check && make migrate`
- After each `new-permission` → `make types`
- After each backend DTO change → `make types`
- After frontend work → `make lint`
- End of each phase → `make check && make lint && make types`

If any checkpoint fails, diagnose + fix before moving to the next phase. Compounding errors across phases are the primary failure mode of module work.

## Don't

- **Don't skip the decision guide.** A module touches many layers; a 45-second decision conversation prevents hours of rework.
- **Don't reorder the phases.** `new-model` before anything referencing the model. `new-permission` before any gated route. `admin-datatable` after both. Getting the order wrong produces compile errors + retroactive edits.
- **Don't invoke this skill for a single route, page, or component.** The sub-skills exist so granular work isn't routed through this orchestrator. Use `new-route` / `admin-page` / `admin-datatable` directly for narrow changes.
- **Don't hand-roll what a sub-skill covers.** Every step in the orchestration is "invoke sub-skill X". If you find yourself writing a migration manually, you're bypassing `new-model`. If you're writing a form modal from scratch, you're bypassing `frontend-form`.
- **Don't skip `make types` between phases.** Each sub-skill's backend DTOs land in `frontend/shared/types/generated/` only after `make types`. Frontend work in the next phase needs those types.
- **Don't skip i18n mirroring.** `locales/en/*.json` additions must have matching entries in `locales/zh/*.json` (and every other locale). CLAUDE.md hard rule.
- **Don't merge a module with failing permissions gating.** Test as a non-developer admin before declaring done — the most common module-level bug is permissions that work for the developer role but break for normal admins.
- **Don't assume the module design is correct without checkpointing.** After Phase A (model), explore the existing code via `make dev`; after Phase B (routes), curl them; after Phase C (UI), walk through as each role. Each phase exposes design issues that are cheap to fix now, expensive later.
- **Don't install new dependencies as part of this skill** (CLAUDE.md rule). Escalate for any new crate / npm package.
- **Don't duplicate documentation.** If a sub-skill has a full procedure, this skill only points at it — never re-write the procedure here. This keeps SSOT at the skill level.

## When this skill doesn't fit

- **Single-layer work** — use the targeted skill (`new-route`, `admin-page`, `admin-datatable`, `new-permission`, `new-model`, etc.).
- **Schema-breaking changes to existing modules** — rename / split / merge operations require migration design work beyond skill scope. Escalate.
- **Architectural / framework refactors** — switching auth driver, changing database engine, etc. Escalate; these have cross-cutting implications the skill catalog doesn't cover.
- **Integration with an external system that has no existing pattern in the starter** — (e.g., first-ever GraphQL endpoint, first-ever gRPC service). Build the first one manually + carefully, then consider whether the pattern earns a skill.
- **Removing a module** — decommissioning reverses orchestration; not a skill. Migrations, UI removal, permission cleanup, i18n pruning — all manual with care.
- **"Extending" an existing module with a small addition** — treat as narrow work; the targeted skills handle it. This orchestrator is for genuinely new vertical slices.
