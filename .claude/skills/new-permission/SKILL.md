---
name: new-permission
description: Use when adding a new variant to the `Permission` enum in `src/ids/permissions.rs` — a new RBAC scope for a feature area. Typical phrasings: "add a new permission", "new RBAC scope for topups", "permission for withdrawals / kyc / exports", "add `foo.manage` permission", "gate this feature behind a new permission". Covers the enum variant, the `module()` / `action()` / `implied_permission()` match arms, the TS regeneration, and pointers for downstream wiring. Do NOT use for applying an existing permission to a new route (just call `.permission(Permission::X)` — no skill needed), adding RBAC to a brand-new portal (that's part of `new-portal`), permission-gating a React component (regular frontend work with `usePermission`), or listing/auditing existing permissions (reference task, not a skill trigger).
---

# New Permission — add a variant to the `Permission` enum

## When to invoke

A user asks to define a new RBAC scope. Typical phrasings:

- "add a new permission for topups"
- "new RBAC scope for withdrawals"
- "permission for KYC review"
- "add `exports.manage` permission"
- "gate this behind its own permission"

Do NOT invoke for:
- Applying an existing `Permission::X` to a new route — the scope DSL handles that inline; no skill needed.
- Adding RBAC to a whole new portal — that's part of the `new-portal` flow.
- Permission-gating a React component — use `usePermission("<module>.<action>")` directly; regular frontend work.
- Listing every permission / auditing RBAC — reference task, not a skill trigger.

## Concept (one paragraph)

The `Permission` enum in `src/ids/permissions.rs` is an app-owned, strongly-typed catalogue of RBAC scopes. Every variant derives `forge::AppEnum` with a `#[forge(key = "<module>.<action>")]` attribute — the key becomes the stable string persisted against admin grants and the TypeScript union exposed to the frontend. Convention: `<module>.read` grants view access and `<module>.manage` grants create/update/delete. `.manage` typically implies `.read` via the `implied_permission()` method, so granting `TopupsManage` also satisfies a `TopupsRead` check. Keys are load-bearing — existing admins have them persisted — so treat them as stable once shipped.

## Prerequisites

Before adding the variant, confirm:

- [ ] **Module name chosen** — e.g., `topups`, `withdrawals`, `kyc`. Pick a plural snake_case noun consistent with existing modules (`admins`, `users`, `credits`). Decide whether this is a brand-new module or a new action on an existing one.
- [ ] **Action type chosen** — typically `read` (view / list / show) or `manage` (create / update / delete). Only deviate for a genuinely different verb (e.g., `export`, `approve`) and only if the existing vocabulary can't express it.
- [ ] **Implication decided** — almost always `.manage` implies `.read`. Opt out only if manage literally does not include viewing (rare).
- [ ] **Downstream target known** — where will the permission be used? Route scope, datatable, badge, React component. A permission with no reference is dead code.

## Decisions — answer before writing code

1. **Module name** — new module (e.g., `topups`) or existing module gaining an action (e.g., `users` gaining `users.export`)?
2. **Action(s)** — adding `read` only, `manage` only, or the standard `read` + `manage` pair?
3. **Implication** — does `.manage` imply `.read`? (Default: yes. If no, say why.)
4. **Downstream wiring** — which of these will consume the new permission: admin route scope, datatable, sidebar badge, frontend `usePermission` call?

If any answer is unclear, ask before generating code. Wrong key choices are schema-breaking to reverse.

## Steps

### 1. Add variants to the `Permission` enum

Path: `src/ids/permissions.rs`

Append new variants to the enum body. Keep variants grouped by module, `Read` before `Manage`, mirroring the existing order:

```rust
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, forge::AppEnum)]
pub enum Permission {
    // ... existing variants
    #[forge(key = "topups.read")]
    TopupsRead,
    #[forge(key = "topups.manage")]
    TopupsManage,
}
```

**Strongly-typed rules:**
- `#[forge(key = "...")]` uses `<module>.<action>` dot-notation. Never collide with an existing key.
- Variant name is the PascalCase mirror of the key: `topups.read` → `TopupsRead`.
- Do NOT rename an existing key — admins in the database hold the old string. Add a new variant; deprecate the old one explicitly if retiring.

### 2. Extend the `key_str()` match

Add arms covering the new variants, returning the exact `#[forge(key = "...")]` string:

```rust
const fn key_str(self) -> &'static str {
    match self {
        // ... existing arms
        Self::TopupsRead => "topups.read",
        Self::TopupsManage => "topups.manage",
    }
}
```

### 3. Extend the `module()` match

Group both `Read` and `Manage` variants of the same module onto one arm, returning the module string:

```rust
pub const fn module(self) -> &'static str {
    match self {
        // ... existing arms
        Self::TopupsRead | Self::TopupsManage => "topups",
    }
}
```

### 4. Extend the `action()` match

Add the new variants to the appropriate action group (`read` or `manage`). The `|` lists are ordered by module — match the existing style:

```rust
pub const fn action(self) -> &'static str {
    match self {
        Self::ExportsRead
        | /* ... */
        | Self::TopupsRead => "read",
        Self::AdminsManage
        | /* ... */
        | Self::TopupsManage => "manage",
    }
}
```

### 5. Extend the `implied_permission()` match

For every new `<Module>Manage`, add an arm returning `Some(Self::<Module>Read)`. Read permissions fall through to `_ => None`:

```rust
pub const fn implied_permission(self) -> Option<Self> {
    match self {
        // ... existing arms
        Self::TopupsManage => Some(Self::TopupsRead),
        _ => None,
    }
}
```

Pattern MUST match the existing convention. If you intentionally skip the implication for a rare action, document why inline — the default is that manage implies read.

### 6. Regenerate TypeScript bindings

```bash
make types
```

The generated `frontend/shared/types/generated/Permission.ts` union (plus `PermissionOptions` / `PermissionValues`) picks up the new keys. Frontend code using `usePermission("topups.read")` compiles against the refreshed union.

## Use the new permission (downstream wiring)

The permission isn't useful until something references it. Common targets — each has its own skill or inline pattern:

- **Route gating** — in `src/portals/<portal>/mod.rs`, attach to a scope via `.permission(Permission::TopupsRead)` (inherited by all routes inside) or override on a specific route with `.permissions([Permission::TopupsManage])`. Scope defaults cascade; individual routes override.
- **Datatable gating** — if adding a datatable for this resource, extend `minimum_read_permission` in `src/portals/admin/datatable_routes.rs` with an arm mapping the datatable ID to the new `Read` permission. The `admin-datatable` skill handles full CRUD wiring.
- **Sidebar badge gating** — if adding a badge tied to this resource, set `const PERMISSION: Permission = Permission::TopupsRead;` on the `AdminBadge` impl. The `admin-badge` skill covers the full flow.
- **Frontend gating** — `usePermission("topups.read")` in React components. The string argument is typed against the regenerated `Permission` union, so typos fail at compile time.

## Verify

Run in order:

```bash
make check        # cargo check — enum + all match arms compile
make types        # regenerate TS bindings
make lint         # clippy + Biome
```

All three must be clean. Then confirm:

- `frontend/shared/types/generated/Permission.ts` contains the new keys.
- Unit tests in `src/ids/permissions.rs` still pass: `cargo test --lib ids::permissions`.
- If you added a `.manage` with an implication, add a matching test mirroring `manage_implies_read_for_introducer_changes` — trivial, one-line assertion, prevents silent regressions.

## Don't

- **Don't use stringly-typed permissions in Rust.** Always `Permission::TopupsRead`, never `"topups.read"`. Strings are only acceptable in the frontend where the typed union is the mechanism.
- **Don't skip `make types`.** The frontend `Permission` union must match the Rust enum exactly — skipping regeneration silently desyncs the two.
- **Don't invent action verbs outside the vocabulary.** Stick to `read` and `manage`. Rare exceptions (`export`, `approve`) require a clear reason and matching UX in the admin permissions picker — don't freelance.
- **Don't add a `.manage` without an `implied_permission()` arm.** Leaving `TopupsManage` without the implication means granting manage alone won't satisfy read checks — almost always wrong.
- **Don't rename an existing `#[forge(key = "...")]`.** The key is persisted against admin grants; renaming is a breaking schema change. Add new, deprecate old.
- **Don't leave a permission unreferenced.** A variant declared with no route / datatable / badge / service check is dead code. Wire it somewhere in the same PR.
- **Don't forget the `key_str()`, `module()`, and `action()` arms.** The compiler catches missing arms, but only if you actually compile — `make check` is mandatory, not optional.

## When this skill doesn't fit

- **Applying an existing `Permission::X` to a new route** → no skill needed. Just add `.permission(Permission::X)` to the scope or route in `src/portals/<portal>/mod.rs`.
- **Adding a whole new portal** → use `new-portal`; it introduces the portal's permission scope alongside guard + config + frontend bootstrap.
- **Per-row permissions** ("admin can only see rows they created") → not RBAC. Implement as a datatable `filters()` scope or service-layer check. Escalate if the design needs a new construct.
- **Permission-gating a React component only** → use `usePermission("<module>.<action>")` directly. No new Rust variant needed if the backend already gates the corresponding API.
- **Auditing or listing current permissions** → read `src/ids/permissions.rs` directly; reference task, not a skill trigger.
