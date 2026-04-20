# Admin Permission System — Design

**Date:** 2026-04-18
**Status:** Implemented
**Scope:** Admin portal only

## Goal

Introduce per-admin permissioning for the admin portal. Each module gets two tiers — `read` (view-only) and `manage` (full CRUD, implicitly granting `read`). Per-admin granted permissions are ticked at admin creation / edit time.

Two admin types (`SuperAdmin`, `Developer`) bypass all permission checks; plain `Admin` is governed entirely by the ticked permission set. A role hierarchy restricts who can manage whom.

## Non-goals

- No roles layer. Permissions are stored directly per admin — not behind a role abstraction.
- No runtime permission creation. The permission registry is compile-time (`src/ids/permissions.rs`).
- No user-portal permissions — this is admin-only.
- No audit trail for permission changes in this iteration.

## Concepts

### Tiers (`admin_type`)

| Tier | Creation | Bypass permission checks | Purpose |
|---|---|---|---|
| `Developer` | Seeder only | Yes (full effective permission catalogue) | Platform / onboarding layer |
| `SuperAdmin` | Seeder only | Yes (full effective permission catalogue) | Business owner |
| `Admin` | Via UI | No — governed by `permissions` column | Staff |

Existing seeder `database/seeders/000000000001_admin_seeder.rs` already provisions one of each; no change required to the seed values.

### Hierarchy Matrix

Actor rows, target columns. `✅` = allowed, `❌` = forbidden.

| Actor ↓ \ Target → | Developer | SuperAdmin | Admin | Self |
|---|---|---|---|---|
| **Developer** | ❌ | ✅ full CRUD, any permissions | ✅ full CRUD, any permissions | ❌ |
| **SuperAdmin** | ❌ | ❌ | ✅ full CRUD, any permissions | ❌ |
| **Admin (with `admins.manage`)** | ❌ | ❌ | ✅ CRUD, permissions granted must be ⊆ actor's own | ❌ |

Derived rules:
1. Nobody can edit their own tier or themselves via `/admins/{id}`. Self-updates go through `/profile`.
2. `admin_type` promotion / demotion only to a tier strictly below the actor's own. SuperAdmin cannot promote anyone (can only touch Admins, cannot push them to SA or above). Developer can demote SA↔Admin but cannot create peers.
3. Delete follows the same matrix as edit.
4. SuperAdmin / Developer are never creatable via UI — only via seeder. The create-admin form offers only `admin_type = Admin`.
5. Plain Admin granting permissions is constrained: `requested_permissions ⊆ actor.effective_permissions`. SuperAdmin / Developer skip this check because their effective set is the full registered permission catalogue.

### Permission Model

Format: dot-delimited `<resource>.<action>`.

Implementation note: Forge route authorization still checks exact permission IDs on the resolved actor. To keep the app behavior aligned with the desired `manage -> read` implication and bypass tiers, permissions are expanded explicitly when issuing and syncing admin tokens:
- `resource.manage` is expanded to include `resource.read`
- `SuperAdmin` / `Developer` tokens receive the full registered permission catalogue

**Registered modules (initial):**

| Permission | Grants |
|---|---|
| `exports.read` | Download/export datatable results when paired with the module's read permission |
| `admins.read` | View admin list + detail |
| `admins.manage` | Create / edit / delete admins (+ read) |
| `users.read` | View user list + detail + datatable |
| `users.manage` | CRUD users (+ read) |
| `countries.read` | View countries + datatable |
| `countries.manage` | Edit countries (+ read) |
| `logs.read` | View server logs |

Not permissioned: `profile.*`, `auth.*`, `datatables.*` (generic dispatch route — the target datatable enforces its own required permission).

**Bug fix to existing code:** `src/ids/permissions.rs` currently uses colon form (`users:manage`). The framework matcher is dot-aware — colon form silently bypasses the `manage → read` implication. Rewriting all IDs to dot form is part of this work.

### SSOT — one Rust enum feeds everything

`src/ids/permissions.rs` is the single source of truth. The enum derives `forge::AppEnum` + `ts_rs::TS`, which auto-registers it via the framework's `inventory`-based type registry — no manual wiring in `main.rs`, no export allowlist.

```rust
#[derive(Clone, Copy, Debug, PartialEq, Eq, forge::AppEnum, ts_rs::TS)]
#[ts(export)]
pub enum Permission {
    #[forge(key = "admins.read")]      AdminsRead,
    #[forge(key = "admins.manage")]    AdminsManage,
    #[forge(key = "users.read")]       UsersRead,
    #[forge(key = "users.manage")]     UsersManage,
    #[forge(key = "countries.read")]   CountriesRead,
    #[forge(key = "countries.manage")] CountriesManage,
    #[forge(key = "logs.read")]        LogsRead,
}

impl From<Permission> for PermissionId {
    fn from(v: Permission) -> Self { PermissionId::new(v.as_key()) }
}
```

Consumers fed from this one enum:

| Consumer | How it reads the enum |
|---|---|
| Route gate | `.permission(Permission::UsersRead)` — framework converts to `PermissionId` via `From` |
| Validation rule | `valid_permission` rule uses `.app_enum::<Permission>()` for allowed-keys check |
| OpenAPI schema | auto-resolved via `ApiSchema` on request DTOs that reference `Permission` |
| DB write | JSONB array stores the `AppEnum` key strings directly (`"admins.read"`, etc.) |
| TypeScript union | `make types` emits `export type Permission = "admins.read" \| …` |
| TypeScript runtime array | `make types` emits `export const PermissionValues: Permission[] = […]` |

After running `make types`, the frontend imports `Permission` as a typed string-literal union. `PermissionMatrix` iterates `PermissionValues`. `usePermission(required: Permission)` is typed, not `string`. Renaming or removing a permission causes TS compile errors at every stale reference — no runtime surprises.

**Workflow for adding a new permission:**
1. Add one variant with `#[forge(key = "<resource>.<action>")]`.
2. Add a label to `locales/{en,zh}/permissions.json`.
3. Run `make types`.
4. Reference it on routes / datatables as needed.

**"Inject more files to transform"** — not needed. The framework uses the `inventory` crate: any type in this crate with `#[derive(forge::AppEnum)]`, `#[derive(forge::ApiSchema)]`, or `#[derive(forge::TS)]` self-registers at compile time and is picked up by `types:export`. There is no per-file opt-in list to maintain.

### Effective Abilities

Admin abilities are stored on issued tokens and then loaded by the normal auth middleware on each request. Abilities are resolved like this when issuing login / websocket tokens and when syncing active admin tokens after permission changes:

```
if admin.admin_type in { SuperAdmin, Developer } → all registered permissions
else                                             → expanded(admin.permissions)
```

Because active token rows are updated after admin permission changes, the new abilities take effect on the target admin's next request without needing a forced re-login.

## Data Model

### Migration

Add column to `admins`:

```sql
ALTER TABLE admins
ADD COLUMN permissions TEXT[] NOT NULL DEFAULT ARRAY[]::text[];
```

Invariants:
- Array of strings.
- Each string is a registered permission ID (validated at write time; unknown IDs rejected).
- Empty array for new SuperAdmin / Developer seeds (they bypass — value is irrelevant).
- Empty array for new plain Admins unless explicitly ticked.

### Model change

`src/domain/models/admin.rs`:

```rust
#[derive(forge::Model)]
#[forge(model = "admins")]
pub struct Admin {
    // ... existing fields
    pub permissions: Vec<String>,   // TEXT[]-backed
}
```

## Architecture

```
         HTTP request
              │
              ▼
     ┌──────────────────┐
     │  Auth middleware │  (loads Admin row from token)
     └──────────────────┘
              │
              ▼
     ┌──────────────────────────────┐
     │ Auth reads token abilities   │
     │ - login/ws issue expanded set│
     │ - updates sync active tokens │
     └──────────────────────────────┘
              │
              ▼
     ┌──────────────────┐
     │  .permission()   │  (existing framework layer)
     │  route gate      │
     └──────────────────┘
              │
              ▼
     ┌──────────────────┐
     │   Handler (thin) │
     └──────────────────┘
              │
              ▼
     ┌────────────────────────────────┐
     │  admin_service (tier guards)   │
     │  - ensure_can_manage(actor,tgt)│
     │  - ensure_can_grant(actor,set) │
     │  - ensure_not_self(actor,tgt)  │
     │  - ensure_admin_type_allowed(…)│
     └────────────────────────────────┘
              │
              ▼
           DB / response
```

Two enforcement layers:

- **Token abilities:** auth reads explicit permissions from the token row. Expanded abilities are written at issue time and active token rows are synced after admin updates.
- **Service layer (tier hierarchy):** needs both actor and target rows — can only run after target is loaded. Lives in `domain/services/admin_service.rs`.

## New Files

```
src/
├── ids/
│   └── permissions.rs                            # modified: dot-form rewrite + add new IDs
├── domain/
│   ├── models/
│   │   └── admin.rs                              # modified: add permissions field
│   └── services/
│       ├── mod.rs                                # modified: export admin_service
│       └── admin_service.rs                      # NEW: CRUD + hierarchy guards
├── portals/admin/
│   ├── mod.rs                                    # modified: register admin_routes + permissions
│   ├── admin_routes.rs                           # NEW: index, show, store, update, destroy, permissions
│   ├── datatables/
│   │   ├── mod.rs                                # modified
│   │   └── admin_datatable.rs                    # NEW
│   ├── datatable_routes.rs                       # modified: enforce per-datatable permission
│   ├── requests.rs                               # modified: CreateAdminRequest, UpdateAdminRequest
│   ├── resources.rs                              # modified: AdminResource
│   ├── responses.rs                              # modified: AdminMeResponse += abilities, AdminResponse
│   └── user_routes.rs                            # modified: fix permission IDs (users.read on list/show)
├── domain/services/auth_service.rs               # modified: issue admin tokens with effective permissions
├── auth_routes.rs (admin)                        # modified: /auth/me returns abilities, /auth/ws-token uses effective permissions
database/migrations/
└── 202604182249_admin_add_permissions_to_admins.rs  # NEW, console-generated migration

frontend/admin/src/
├── pages/
│   ├── AdminsPage.tsx                            # NEW: list via DataTable
│   ├── AdminFormPage.tsx                         # NEW: create/edit with permission matrix
├── components/
│   └── PermissionMatrix.tsx                      # NEW: radio-per-module UI
├── config/side-menu.ts                           # modified: gate menu items by permission
└── hooks/
    └── usePermission.ts                          # NEW: hasPermission(action) helper

frontend/shared/auth/types.ts                     # modified: AuthUser += abilities, admin_type
locales/{en,zh}/permissions.json                  # NEW: human labels for modules + actions
locales/{en,zh}/admin.json                        # modified: add error messages + page text
```

## Component Details

### Token ability resolution

A separate admin-abilities HTTP middleware is not added. Instead:

- admin login issues token pairs with `admin_service::effective_permission_keys(&admin)`
- admin websocket token exchange does the same
- admin updates sync active token rows in `personal_access_tokens.abilities`

That keeps route authorization and websocket authorization aligned with the same effective permission set while staying compatible with Forge's current exact-match authorizer.

### Service — `src/domain/services/admin_service.rs`

Single module containing:

- `async fn list(app, pagination) -> PaginatedAdmins`
- `async fn show(app, id) -> Admin`
- `async fn create(app, actor: &Admin, req: CreateAdminRequest) -> Admin`
- `async fn update(app, actor: &Admin, target_id, req: UpdateAdminRequest) -> Admin`
- `async fn delete(app, actor: &Admin, target_id) -> ()`

Guards (private helpers, called from `create` / `update` / `delete`):

- `ensure_not_self(actor, target_id)` → forbidden if same
- `ensure_can_manage(actor, target) -> Result<()>` — implements the matrix. Developer can touch SA + Admin. SA can touch only Admin. Admin can touch only Admin.
- `ensure_admin_type_allowed(actor, requested_type)` — actor tier must be strictly above `requested_type`. Plain Admin may only set `Admin`. SA may only set `Admin`. Developer may set `Admin` or `SuperAdmin`. None may ever set `Developer` via UI (defense-in-depth — also blocked at request DTO level).
- `ensure_can_grant(actor, requested_permissions)` — for plain Admin: every requested ID must be in actor's effective set. For SA / Dev: no-op (they bypass).

All error messages go through `t!(i18n, "admin.errors.…")`.

### Route handlers — `src/portals/admin/admin_routes.rs`

Thin per convention. Example:

```rust
pub async fn store(
    State(app): State<AppContext>,
    Auth(actor): Auth<Admin>,
    JsonValidated(req): JsonValidated<CreateAdminRequest>,
) -> Result<impl IntoResponse> {
    let admin = admin_service::create(&app, &actor, &req).await?;
    Ok((StatusCode::CREATED, Json(AdminResource::make(&admin))))
}
```

Routes registered in `src/portals/admin/mod.rs`:

| Name | Method | Path | Guard | Permission |
|---|---|---|---|---|
| `admin.admins.index` | GET | `/admins` | Admin | `admins.read` |
| `admin.admins.show` | GET | `/admins/{id}` | Admin | `admins.read` |
| `admin.admins.store` | POST | `/admins` | Admin | `admins.manage` |
| `admin.admins.update` | PUT | `/admins/{id}` | Admin | `admins.manage` |
| `admin.admins.destroy` | DELETE | `/admins/{id}` | Admin | `admins.manage` |
| `admin.admins.permissions` | GET | `/admins/permissions` | Admin | `admins.read` |

The `.permissions` route returns a per-actor catalogue `[{ permission: "users.read", grantable: true }]` — the full list is already available to the frontend as the typed `Permission` union (from `make types`), so this endpoint only supplies the runtime `grantable` flag: `true` for permissions the actor holds (for plain Admins) or `true` for all (for SA/Dev bypass). The UI disables ungrantable rows.

### Datatable permission enforcement — `src/portals/admin/datatable_routes.rs`

The generic `query` / `download` handler looks up the required permission via a new portal-local map populated at registration:

```rust
fn required_permission(id: &str) -> Option<PermissionId> {
    match id {
        "admin.users"     => Some(Permission::UsersRead.into()),
        "admin.countries" => Some(Permission::CountriesRead.into()),
        "admin.admins"    => Some(Permission::AdminsRead.into()),
        _ => None,
    }
}

pub async fn query(
    State(app): State<AppContext>,
    Auth(actor): Auth<Admin>,         // + I18n, Path, Uri
    ...
) -> Result<impl IntoResponse> {
    if let Some(required) = required_permission(&id) {
        ensure_permissions(&actor_auth, PermissionMode::Any, &[required.to_string()])?;
    }
    // ... existing dispatch
}
```

Bypass tiers succeed because their tokens carry the full explicit permission catalogue — no route-local special case is needed.

Not picking registry-level metadata because the ID→permission map is small (one line per datatable) and keeping it in the portal file where datatables are declared keeps the cross-reference local.

### Request DTOs — `src/portals/admin/requests.rs`

```rust
#[derive(Deserialize, forge::ApiSchema, ts_rs::TS, Validate)]
#[ts(export)]
pub struct CreateAdminRequest {
    #[validate(required, min(3), max(50))]
    pub username: String,
    #[validate(required, email)]
    pub email: String,
    #[validate(required, min(2))]
    pub name: String,
    #[validate(required, min(8))]
    pub password: String,
    #[validate(required, enum_value = "AdminType")]
    pub admin_type: AdminType,          // "Developer" is rejected at service layer
    pub permissions: Vec<Permission>,   // empty vec = nothing ticked
    #[validate(required)]
    pub locale: String,
}

#[derive(Deserialize, forge::ApiSchema, ts_rs::TS, Validate)]
#[ts(export)]
pub struct UpdateAdminRequest {
    pub name: Option<String>,
    pub email: Option<String>,
    pub password: Option<String>,       // optional; unchanged if None
    pub permissions: Option<Vec<Permission>>,
    pub admin_type: Option<AdminType>,
    pub locale: Option<String>,
}
```

Username is immutable after create (simpler; usernames are identifiers).

Permission validation uses `validator.each(...).app_enum::<Permission>()`, so unknown IDs are rejected before the service layer sees them.

### Response — `AdminResponse`

```rust
#[derive(Serialize, forge::ApiSchema, ts_rs::TS)]
#[ts(export)]
pub struct AdminResponse {
    pub id: String,
    pub username: String,
    pub email: String,
    pub name: String,
    pub admin_type: AdminType,
    pub permissions: Vec<Permission>,
    pub locale: String,
    pub created_at: String,
    pub updated_at: String,
}
```

### `/auth/me` extension

`AdminMeResponse` gains `abilities: Vec<Permission>` (the effective set after expansion). Frontend reads this for gating.

### Frontend

**`frontend/admin/src/auth.ts`** uses the generated `AdminMeResponse` from `make types` as the auth actor shape:

```ts
export const auth = createAuth<AdminMeResponse>({ ... });
```

**`frontend/admin/src/hooks/usePermission.ts`** stays simple because abilities are already expanded explicitly by the backend:

```ts
export function hasPermission(
  abilities: Permission[] | undefined,
  required: Permission,
): boolean {
  return abilities?.includes(required) ?? false;
}
export function usePermission(required: Permission) {
  const { user } = useAuth();
  return hasPermission(user?.abilities, required);
}
```

**`frontend/admin/src/components/PermissionMatrix.tsx`** — per module, one radio group with three options: `None`, `Read`, `Manage`. The module list is derived at build time from the typed `PermissionValues` array (grouped by dot-prefix); no hardcoding. Emits `Permission[]` (typed) to the form. At render time, the component queries `/admins/permissions` for the per-actor `grantable` flags and disables rows the actor cannot grant — authoritative enforcement remains in `ensure_can_grant` at save.

**`frontend/admin/src/config/side-menu.ts`** — each item gets an optional `permission` key; sidebar filters by `hasPermission`.

**Admin form (`AdminFormPage.tsx`)** — `admin_type` is shown as a disabled-or-hidden field unless actor is Developer (can set SA or Admin). For plain Admin and SA, only `Admin` is available. Developer is never an option in the UI.

### Translations

`locales/en/admin.json` new keys (and matching `zh.json`):

```json
{
  "admin.errors.cannot_edit_self": "You cannot edit your own account here — use Profile instead.",
  "admin.errors.cannot_manage_tier": "You cannot manage an admin of this tier.",
  "admin.errors.cannot_grant_permission": "You cannot grant a permission you do not hold: {{permission}}",
  "admin.errors.invalid_admin_type": "You cannot assign this admin type.",
  "admin.errors.unknown_permission": "Unknown permission: {{permission}}",
  "admin.admins.title": "Admins",
  "admin.admins.create": "New Admin",
  …
}
```

`locales/en/permissions.json`:

```json
{
  "permissions.admins.label": "Admins",
  "permissions.admins.read": "View",
  "permissions.admins.manage": "Manage (CRUD)",
  "permissions.users.label": "Users",
  …
}
```

## Testing

- **Unit tests — service guards** (`admin_service::tests`): exhaustive matrix — every combo of actor-tier × target-tier × action (create/update/delete). Plus permission-subset check for plain Admin.
- **Unit tests — permission matcher** (frontend `hasPermission`): mirror the backend cases.
- **Integration test — end-to-end**: seed SA + Dev + Admin; hit `/admins` routes; verify 403 on forbidden transitions, 200 on allowed.
- **Datatable test**: admin with `users.read` only → admin.users datatable returns 200; admin without → 403.

## Error Handling

All service errors are `AppError::Forbidden` (→ HTTP 403) with translated messages. Validation errors are `AppError::Validation` (→ 422). Unknown permission strings rejected at validation layer with field-specific error.

No silent drop-to-noop. If a plain Admin sends `permissions` they don't hold, the entire request fails — no partial grant.

## Migration Ordering

1. DB migration adds column with default `[]` — safe to deploy with old binary (column ignored).
2. New binary deploys — login/ws-token issuance and token-sync logic start using effective abilities. Existing plain Admins with `[]` keep least-privilege access until a SA/Dev grants permissions intentionally.
3. Operator manually ticks permissions for existing plain Admins via new UI.

No data backfill script — empty permissions is the safe default (least privilege). Operator needs to grant intentionally.

## Open questions

None outstanding — all decisions locked in the brainstorming conversation.

## Out of scope (future work)

- Roles abstraction (if team size grows).
- Permission change audit log.
- Live permission invalidation for open WebSocket connections.
- User portal permissions.
