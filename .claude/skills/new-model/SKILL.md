---
name: new-model
description: Use when adding a new `forge::Model` to the starter — the foundational data type everything else (migrations, services, routes, DTOs, datatables, badges) hangs off. Typical phrasings: "add a Post model", "new TopUp model with status enum and user FK", "create a Merchant login actor", "add a reference table for currencies". Covers the full flow — struct design + `#[forge(...)]` attributes + migration SQL + seeder (optional) + `src/domain/models/mod.rs` export + provider registration (only for authenticatable actors) + relation methods (belongs_to / has_one / has_many) + enum-typed fields + soft-delete + password write_mutator + Guard/auth.toml wiring for login actors. Do NOT use for: adding a single column to an EXISTING model (write the migration + field directly, no skill needed); creating a response/request DTO (those live in `src/portals/<portal>/responses/<resource>.rs` and `requests/<resource>.rs`, not here); creating a pure datatable projection row struct (that's part of `admin-datatable`); renaming or deleting an existing model (escalate — schema change with migration implications).
---

# New Model — add a new `forge::Model` to the starter

## When to invoke

User wants a new domain data type persisted to the database. Typical phrasings:

- "add a Post model with title, body, author"
- "new TopUp model — belongs to User, has status enum, amount as Numeric"
- "add Merchant as a login actor with its own portal"
- "create a Currency reference table keyed by code"
- "add a Review model with a 1-to-many to Product"
- "add an AuditLog with polymorphic subject"

Do NOT invoke for:
- **Adding a column to an existing model** — write the migration + add the field directly. No skill needed for delta edits.
- **Adding a response/request DTO** — those are in `src/portals/<portal>/{responses,requests}.rs` and bound to routes, not to models. Models feed DTOs but aren't themselves exported to TS.
- **Creating a Projection row for a datatable** — handled inline by the `admin-datatable` skill when source shape = "projection with joins".
- **Renaming / deleting an existing model** — escalate. Schema-altering changes need migration sequencing review.
- **Adding a forge-internal or framework-level type** — this skill is for app domain models.

## Concept

A `forge::Model` in the starter is a Rust struct `#[derive(Serialize, forge::Model)]` with a `#[forge(model = "<table>")]` attribute, mirroring a PostgreSQL table. The macro generates:

- Column constants (`Admin::USERNAME`, `TopUp::STATUS`) for strongly-typed queries
- A table metadata accessor (`<Model>::table_meta()`) used by e.g. the badge registry
- `Model::model_query()`, `Model::model_create()`, `.update()`, `.delete()` builders
- Soft-delete scoping (active-only by default when `soft_deletes = true`)
- Lifecycle event emission (`ModelCreated/Updated/DeletedEvent` on every save/delete) — consumed by badge listeners and any other `impl EventListener`

Models are auto-discovered by `forge::register_generated_database!(registrar)?` in the app provider — no explicit registration per model is needed **except** for `Authenticatable` login actors, which additionally need `registrar.register_authenticatable::<M>()?` plus Guard/auth.toml wiring.

Relations are hand-written as methods on the model using Forge's `belongs_to()` / `has_one()` / `has_many()` helpers returning `RelationDef<Self, Target>`. There is **no** `#[forge(belongs_to = ...)]` attribute in this Forge version — do not invent one.

**Deeper references** (read only when the decision guide routes you here):
- CLAUDE.md: "Architecture Rules" + "Adding a new model" section (if present)
- Existing model examples: `src/domain/models/admin.rs` (auth actor), `src/domain/models/country.rs` (manual PK), `src/domain/models/credit_transaction.rs` (enum fields + polymorphic FK), `src/domain/models/user.rs` (mixed FK patterns + relation methods)
- Migrations: `database/migrations/` (see any `create_users.rs`-style file for the template)
- Seeders: `database/seeders/` (see `000000000001_admin_seeder.rs` for the pattern)

## Prerequisites

Before generating any code, confirm each exists. If any is missing, create it first — do NOT paper over gaps:

- [ ] **PostgreSQL + Redis running locally** (`make dev` starts them; `make migrate` requires them). If the target environment is remote, the user runs `make migrate` — you don't.
- [ ] **Any domain enum** the model will reference already exists in `src/domain/enums/` with `#[derive(forge::AppEnum)]`. If not, create it first — new enums come before models that use them.
- [ ] **Any foreign-key target model** already exists. If this model references `User` and `Country`, both must already be models. You can reference them in this new model's struct, but you cannot create an FK to a non-existent table.
- [ ] **Any permission** this model introduces is added to `src/ids/permissions.rs` (if you plan to gate admin operations on it). Can be deferred, but it's easier to add now.

## Decisions — answer ALL before writing code

Walk the user through every question. Do NOT generate code on guesses. Missing answers produce wrong models, and a wrong model cascades into every downstream layer.

### 1. Purpose archetype — what kind of model is this?

- **Standard domain entity** (80%) — a normal business object: posts, orders, top-ups, messages. `ModelId<Self>` PK, standard timestamps, optional soft-delete, optional FKs.
- **Authenticatable login actor** — this model logs in (users, admins, merchants, partners). Requires `impl Authenticatable` + `impl HasToken`, a Guard variant, an auth.toml block, provider registration, and typically a password `write_mutator`. Read `./examples/authenticatable-model.md` for the complete trace before writing code.
- **Reference data with manual PK** — rows keyed by an external code (ISO currency, ISO country, HTTP status, timezone). Use `primary_key = "<col>"` + `primary_key_strategy = "manual"` + no `ModelId<Self>`. Read `./references/manual-primary-key.md`.
- **Audit / history** — immutable record of what-changed-when, typically with denormalized display fields alongside FKs so the audit stays readable even after related records are deleted. See `AdminUserIntroducerChange` for the template.
- **Pivot / join table** — pure FK bridge, no domain fields of its own (many-to-many). See `AdminCreditAdjustment` for the template.
- **Ledger / transaction** — append-only, typically with enum-typed kind/type fields + `Numeric` amount + polymorphic subject. See `CreditTransaction`.
- **Content with translations/attachments** — model impls `HasTranslations` and/or `HasAttachments` (Forge-supplied polymorphic traits). See `Page`. Read `./references/polymorphic-fk.md`.

### 2. Primary key strategy

- **Default — `ModelId<Self>`** — 99% of the time. UUIDv7 auto-generated by DB (`DEFAULT uuidv7()`). Sortable. Use this unless you have a concrete reason not to.
- **Manual `String` PK** — only when joining an external identifier (ISO-2 country code, ISO-4217 currency code). Requires `primary_key = "..."` + `primary_key_strategy = "manual"` on the struct attribute. FKs from other models to this one use `String` (or `Option<String>`), NOT `ModelId<Self>`.

### 3. Soft delete — yes or no?

- **Yes** if you need to recover deleted rows, preserve audit context, or have FKs that should not hard-cascade. Add `deleted_at: Option<DateTime>` field and `soft_deletes = true` to the `#[forge(...)]` attribute. Migration gets `deleted_at TIMESTAMPTZ NULL`.
- **No** for reference data, pivot tables, immutable ledgers.

Default: **No** unless there's a reason. Existing starter: Admin and User have soft-delete; nothing else does.

### 4. Timestamps shape

Three variants in the starter:

- **Standard** (most common): `created_at: DateTime` + `updated_at: Option<DateTime>`. Migration: `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `updated_at TIMESTAMPTZ` (nullable, no default).
- **Auth-style**: `created_at: DateTime` + `updated_at: DateTime` (both non-null). Migration: both `NOT NULL DEFAULT NOW()`. Used by Admin + User.
- **No updates** (ledger / audit): `created_at: DateTime` only, no `updated_at`. Rare — the rows are append-only, never mutated.

Default: **Standard**.

### 5. Fields — for each non-standard field

Answer:

- **Rust type** — `String` / `Option<String>` / `bool` / `i32` / `Numeric` / `DateTime` / `Option<DateTime>` / `serde_json::Value` / `Vec<String>` / `<YourEnum>` / `ModelId<OtherModel>` / `Option<ModelId<OtherModel>>`
- **SQL column type** — derived from Rust type via the mapping table below
- **Nullable?** — `NOT NULL` (Rust: `T`) vs `NULL` (Rust: `Option<T>`). Must match.
- **Default?** — DB-side (`DEFAULT NOW()`, `DEFAULT 'draft'::text`, `DEFAULT '[]'::jsonb`) or app-side
- **Mutator?** — `#[forge(write_mutator = "fn_name")]` for password hashing, normalization, encryption
- **Enum-typed?** — if yes, choose where the enum lives (per CLAUDE.md's "One rule for enums"):
  - **Shared enum** — referenced by multiple models, services, or DTOs → `src/domain/enums/<snake>.rs` with `#[derive(forge::AppEnum)]`, exported from `src/domain/enums/mod.rs`. This is the default for anything another module might touch.
  - **File-private helper enum** — used only inside this single model's file, never referenced elsewhere → declare in the same `.rs` file above the struct with `#[derive(forge::AppEnum)]`. Do NOT export it. CLAUDE.md explicitly endorses this for genuinely local enums.
  - **Forge-provided enum** (e.g., `forge::countries::CountryStatus`, `forge::settings::SettingType`) → import from `forge::`. Never redeclare.
  - SQL column is `TEXT` regardless (AppEnum stores the string key; there's no PostgreSQL `CREATE TYPE ... AS ENUM`).

### Rust ↔ SQL type mapping

| Rust type | SQL column type | Notes |
|---|---|---|
| `ModelId<Self>` | `UUID PRIMARY KEY DEFAULT uuidv7()` | UUIDv7 preferred for time-sortability |
| `ModelId<Other>` | `UUID NOT NULL REFERENCES <other_table>(id)` | FK; target uses `ModelId` |
| `Option<ModelId<Other>>` | `UUID NULL REFERENCES <other_table>(id) ON DELETE SET NULL` | Nullable FK |
| `String` | `TEXT NOT NULL` | Unbounded; `CHAR(n)` only for fixed external codes |
| `Option<String>` | `TEXT NULL` | Nullable text |
| `bool` | `BOOLEAN NOT NULL DEFAULT false` | DB-side default |
| `i32` | `INT NOT NULL` | — |
| `Numeric` | `NUMERIC(20,8) NOT NULL` | Financial default scale |
| `DateTime` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | Always TZ-aware |
| `Option<DateTime>` | `TIMESTAMPTZ NULL` | No default for nullable |
| `serde_json::Value` | `JSONB NOT NULL DEFAULT '{}'::jsonb` | Cast `::jsonb` on default |
| `Vec<String>` | `TEXT[] NOT NULL DEFAULT ARRAY[]::text[]` | PG array |
| `<YourEnum>` (AppEnum) | `TEXT NOT NULL` | Stored as string key; NOT a PG enum type |

### 6. Foreign keys

For each FK:

- **Target model** — what does this reference? Must already exist.
- **FK field Rust type** — must match target's PK type:
  - Target has `ModelId<Self>` PK → FK is `ModelId<Target>` or `Option<ModelId<Target>>`
  - Target has manual `String` PK (Country) → FK is `String` or `Option<String>` — **NOT** `ModelId<Country>`
- **ON DELETE semantics** — pick one:
  - `RESTRICT` (default) — prevents deletion of target if referenced
  - `SET NULL` — only if FK is nullable; preserves this row, clears the FK
  - `CASCADE` — deletes this row when target is deleted (use sparingly; prefer soft-delete + `RESTRICT`)
- **ON UPDATE** — `CASCADE` for external codes that might change (`country_iso2`), omit for UUID FKs

### 7. Relations to declare

For each FK, typically add:

- A `Loaded<Option<Target>>` field on the struct marked `#[serde(skip)]`
- A `pub fn <name>() -> RelationDef<Self, Target>` method using `belongs_to(...)`

If the model is the *other* side (parent of a `has_one` or `has_many`), declare those too. Read `./references/relations.md` for the full pattern vocabulary.

### 8. Authenticatable?

If this is a login actor (answer 1 = "authenticatable login actor"), the model additionally needs:

- `impl HasToken for <Model>` — returns `self.id.to_string()` for token claims
- `impl Authenticatable for <Model>` — returns the Guard ID
- A Guard variant in `src/ids/guards.rs`
- An `[auth.guards.<name>]` block in `config/auth.toml`
- A `registrar.register_authenticatable::<<Model>>()?;` call in `AppServiceProvider`
- Typically a password field with `#[forge(write_mutator = "hash_password")]` and a private `async fn hash_password(...)` helper

Read `./examples/authenticatable-model.md` for the complete trace — this is the most error-prone variant; following the example verbatim is strongly recommended.

### 9. Lifecycle hooks needed?

- **Field-level transformation** (hash a password, normalize an email to lowercase, encrypt a value) → `#[forge(write_mutator = "fn")]`. Private async function on the model. Sufficient for 95% of cases.
- **Multi-field coordination on save/delete** (derive one field from another, validate cross-field invariants, enforce business rules that can't live in the DB) → `impl ModelLifecycle<M>` + `#[forge(lifecycle = "Type")]` struct attribute. Unused in the starter today — read `./references/lifecycle-hooks.md` if needed.
- **Cross-cutting side effect** (update a badge count, send an email, write an audit row for a different model) → **don't** put it on the model. Write an `impl EventListener<ModelCreatedEvent>` (or `Updated`/`Deleted`) in a service provider. The badge system is the canonical example.

### 10. Permissions

Does this model introduce a new RBAC scope (e.g., `posts.read`, `posts.manage`)? If yes:

- Add variants to the `Permission` enum in `src/ids/permissions.rs`
- Run `make types` to regenerate TypeScript bindings
- The skill will route downstream work (datatable, routes) to skills that consume these permissions

### 11. Seeder?

Does the model need dev-time data (reference rows, system users, default settings)?

- If yes, create `database/seeders/{NNN}_{name}_seeder.rs` implementing `SeederFile`. Templates below.
- Must be idempotent (safe to re-run). Two patterns: raw SQL with `ON CONFLICT DO NOTHING`, or model-builder find-or-create.
- Password fields are seeded as **plain text** — the model's `write_mutator` hashes them at save.

### 12. Downstream routing

After the model lands, which features does the user want?

- **Admin list page / CRUD** → invoke `admin-datatable` skill after this one.
- **Sidebar count badge** (e.g., "pending X count") → invoke `admin-badge` skill after this one.
- **REST endpoints beyond admin CRUD** (public API, user portal, webhooks) → write routes + services directly; no skill yet.

Present these answers to the user. Confirm. Only then proceed to Steps.

## Core steps — always run

### 1. Create the model file

Generate the scaffold via the CLI — never hand-create the file. The scaffolder produces `src/domain/models/<snake_case>.rs` with the correct module shape:

```bash
PROCESS=cli cargo run -- make:model --name <PascalName>
```

Then edit the generated file to match one of the templates below (the CLI gives you a minimal struct; you add fields, `#[forge(...)]` attributes, impls). Don't skip the CLI — it handles file naming + initial boilerplate correctly.

Pick the template matching your decisions:

#### Minimal domain entity (80% case — no auth, no soft-delete, no relations)

```rust
use forge::prelude::*;
use serde::Serialize;

#[derive(Serialize, forge::Model)]
#[forge(model = "<table_name>")]
pub struct <YourModel> {
    pub id: ModelId<Self>,
    // ... fields in schema order: required first, then optional, then timestamps
    pub <field_1>: String,
    pub <field_2>: Option<String>,
    pub created_at: DateTime,
    pub updated_at: Option<DateTime>,
}
```

No `impl` block needed unless there's a field mutator or relation.

#### With enum field

```rust
use forge::prelude::*;
use serde::Serialize;

use crate::domain::enums::<YourEnum>;

#[derive(Serialize, forge::Model)]
#[forge(model = "<table_name>")]
pub struct <YourModel> {
    pub id: ModelId<Self>,
    pub status: <YourEnum>,    // stored as TEXT, serialized as string key
    pub created_at: DateTime,
    pub updated_at: Option<DateTime>,
}
```

#### With foreign key + belongs_to relation

```rust
use forge::prelude::*;
use serde::Serialize;

use crate::domain::models::User;

#[derive(Serialize, forge::Model)]
#[forge(model = "<table_name>")]
pub struct <YourModel> {
    pub id: ModelId<Self>,
    pub user_id: ModelId<User>,
    pub <other_field>: String,
    pub created_at: DateTime,
    pub updated_at: Option<DateTime>,
    #[serde(skip)]
    pub user: Loaded<Option<User>>,
}

impl <YourModel> {
    pub fn user() -> RelationDef<Self, User> {
        belongs_to(
            Self::USER_ID,
            User::ID,
            |row| Some(row.user_id),
            |row, user| row.user = Loaded::new(user),
        )
        .named("user")
    }
}
```

For `has_one`, `has_many`, self-reference, or polymorphic relations, see `./references/relations.md`.

#### With soft-delete

Add `soft_deletes = true` to the attribute and `deleted_at` field:

```rust
#[derive(Serialize, forge::Model)]
#[forge(model = "<table_name>", soft_deletes = true)]
pub struct <YourModel> {
    pub id: ModelId<Self>,
    // ... other fields
    pub created_at: DateTime,
    pub updated_at: Option<DateTime>,
    pub deleted_at: Option<DateTime>,
}
```

Model-query defaults to excluding soft-deleted rows. Use `.with_trashed()` or `.only_trashed()` to opt in.

#### With password mutator

```rust
use forge::prelude::*;
use serde::Serialize;

#[derive(Serialize, forge::Model)]
#[forge(model = "<table_name>")]
pub struct <YourModel> {
    pub id: ModelId<Self>,
    // ...
    #[serde(skip)]
    #[forge(write_mutator = "hash_password")]
    pub password_hash: String,
    pub created_at: DateTime,
    pub updated_at: DateTime,
}

impl <YourModel> {
    async fn hash_password(ctx: &ModelHookContext<'_>, value: String) -> Result<String> {
        ctx.app().hash()?.hash(&value)
    }
}
```

Save with `.set(<YourModel>::PASSWORD_HASH, plaintext)` — the mutator hashes at write time. **Do not pre-hash in callers or seeders.**

#### Authenticatable (login actor) — see `./examples/authenticatable-model.md`

The full shape has model struct + password mutator + `impl HasToken` + `impl Authenticatable` + Guard enum + auth.toml + provider registration. Read that example before writing.

### 2. Export the module

Edit `src/domain/models/mod.rs`. Add the declaration alphabetically and the `pub use`:

```rust
pub mod <snake_case>;
// ...
pub use <snake_case>::<YourModel>;
```

If the file also exports related types (e.g., `CreditTransaction` file exports `CreditRelatedKey`), list them in the `pub use`.

### 3. Create the migration

Generate via the CLI scaffolder — **never hand-name the file**. The scaffolder applies the correct timestamp prefix and produces the `MigrationFile` skeleton:

```bash
PROCESS=cli cargo run -- make:migration --name create_<table_name_plural>
```

This creates `database/migrations/{YYYYMMDDhhmm}_create_<table_name_plural>.rs` with empty `up` + `down` methods. Then edit the generated file and fill the `up`/`down` bodies.

**Why CLI and not manual**: the timestamp prefix is how Forge orders migrations. Hand-picking a number risks collisions (two devs pick the same), leaves gaps, or drifts from the current time. The scaffolder pins the current timestamp automatically.

**Baseline migration files are Forge-owned, not your template**: files in `database/migrations/` starting with `000000000001_` through `000000000011_` (`personal_access_tokens`, `notifications`, `metadata`, `attachments`, `model_translations`, `countries`, `settings`, `users`, `admins`, etc.) are **Forge-published baseline schemas** — written into your project by `PROCESS=cli cargo run -- migrate:publish` when the project was bootstrapped. Do NOT hand-edit them. Do NOT mimic their numeric `0000000xx_` naming for new app migrations — your migrations always use the timestamp format that `make:migration` produces.

Fill the generated file's `up` body — below is the shape:

```rust
use async_trait::async_trait;
use forge::prelude::*;

pub struct Entry;

#[async_trait]
impl MigrationFile for Entry {
    async fn up(ctx: &MigrationContext<'_>) -> Result<()> {
        ctx.raw_execute(
            r#"
            CREATE TABLE <table_name_plural> (
                id UUID PRIMARY KEY DEFAULT uuidv7(),
                <field_1> TEXT NOT NULL,
                <field_2> TEXT,
                <fk_field>_id UUID NOT NULL REFERENCES <target_table>(id) ON DELETE RESTRICT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ
            )
            "#,
            &[],
        )
        .await?;

        ctx.raw_execute(
            "CREATE INDEX idx_<table>_<fk_field>_id_created_at ON <table_name_plural> (<fk_field>_id, created_at DESC)",
            &[],
        )
        .await?;

        Ok(())
    }

    async fn down(ctx: &MigrationContext<'_>) -> Result<()> {
        ctx.raw_execute("DROP TABLE IF EXISTS <table_name_plural>", &[])
            .await?;
        Ok(())
    }
}
```

**Migration rules:**

- Always pair `up` + `down`. The `down` is a destructive rollback — test it mentally before shipping.
- ID: `UUID PRIMARY KEY DEFAULT uuidv7()`. Only use `gen_random_uuid()` if UUIDv4 is specifically needed (rare).
- FKs: name `<singular>_id`. Always `REFERENCES` + explicit `ON DELETE` policy. `RESTRICT` is the safe default.
- Indexes: name `idx_<table>_<column>[_<qualifier>]`. Always index FK columns. Add composite `(fk_id, created_at DESC)` when time-series queries are expected.
- Partial indexes for active-lookup on soft-deletes: `CREATE INDEX ... WHERE deleted_at IS NULL`.
- JSONB default: `'{}'::jsonb` (cast required).
- Numeric for money: `NUMERIC(20,8)`.
- `deleted_at` for soft-delete: `TIMESTAMPTZ NULL` (no default).

### 4. Apply the migration

Run: `make migrate`

Expected: migration runs clean. If the SQL has a typo or the FK target doesn't exist, it fails — read the error, fix the migration file, re-run.

### 5. Verify Rust compiles

Run: `make check`

Expected: clean. If the model struct references a field that doesn't exist in the migration (or vice versa), or an enum that isn't imported, you'll get a compile error here. Fix at the source.

If you added column constants used elsewhere (e.g., a new enum variant referenced by a datatable), make sure all dependent code is updated.

## Optional domain methods on the model

After the core steps produce a compilable model, add `impl <YourModel> { ... }` methods for common patterns. Always prefer these over inline raw queries or raw SQL scattered across callers — **the model is the single source of truth for its own query shapes**.

### Scoped query helper (composable)

Returns a `ModelQuery<Self>` pre-filtered with a common criterion. Callers chain further `.where_eq(...)`, `.order_by(...)`, or terminal methods (`.count`, `.first`, `.get`). Use whenever the same filter is applied in more than one call site.

```rust
impl <YourModel> {
    /// Active (non-deleted) rows only. Chain further filters + a terminal method.
    pub fn active() -> ModelQuery<Self> {
        Self::model_query().where_(Self::DELETED_AT.is_null())
    }

    /// Rows with a specific status. The typed enum variant prevents typos.
    pub fn with_status(status: <YourStatusEnum>) -> ModelQuery<Self> {
        Self::model_query().where_eq(Self::STATUS, status)
    }
}
```

Usage at call sites:

```rust
let count = <YourModel>::with_status(<YourStatusEnum>::Pending).count(&*db).await?;
let recent = <YourModel>::active().order_by(Self::CREATED_AT.desc()).limit(10).get(&*db).await?;
```

### Terminal query helper

Returns `Option<Self>`, `Vec<Self>`, or `u64`. Use when the query has no natural extension point. The canonical example is `User::find_active_by_login` in `src/domain/models/user.rs`.

```rust
impl <YourModel> {
    pub async fn find_by_<field><E>(executor: &E, value: &str) -> Result<Option<Self>>
    where
        E: QueryExecutor,
    {
        Self::model_query()
            .where_eq(Self::<FIELD>, value)
            .first(executor)
            .await
    }
}
```

### Computed accessor (read-only, no query)

Derives a value from the model's already-loaded state. Does not touch the database. Use when multiple call sites would otherwise duplicate the same derivation.

```rust
impl <YourModel> {
    pub fn display_name(&self) -> &str {
        self.nickname.as_deref().unwrap_or(&self.username)
    }

    pub fn is_expired(&self, now: DateTime) -> bool {
        self.expires_at.map(|t| t <= now).unwrap_or(false)
    }
}
```

See `Page::default_title(&self)` in `src/domain/models/page.rs` for a real-world example that reads a loaded relation.

### Relation method (already covered in Core, summarized here for discoverability)

```rust
impl <YourModel> {
    pub fn <relation_name>() -> RelationDef<Self, <Target>> {
        belongs_to(
            Self::<FK_COLUMN>,
            <Target>::<TARGET_PK>,
            |row| Some(row.<fk_field>),
            |row, target| row.<relation_field> = Loaded::new(target),
        )
        .named("<relation_name>")
    }
}
```

For `has_one`, `has_many`, polymorphic, and self-referencing variants, see `./references/relations.md`.

### What goes ON the model vs. elsewhere

- **On the model** — shape-defining queries (scopes), safe accessors, relation definitions, field mutators (`write_mutator`).
- **In a service** (`src/domain/services/<snake>_service.rs`) — orchestration that crosses multiple models, transactional business workflows, authorization gates. Services call model methods; models do not call services.
- **In a route handler** — extract → validate → delegate to service → respond. Handlers never query the model directly; they go through services (per CLAUDE.md's "thin portals, fat services").

## Variant extensions (inline)

Run any that apply based on the decision guide.

### 8-authenticatable. Wire a login actor

Additional steps beyond Core:

**8a. Add a Guard variant** — edit `src/ids/guards.rs`:

```rust
pub enum Guard {
    User,
    Admin,
    <YourActor>,   // ← add this
}

impl From<Guard> for GuardId {
    fn from(v: Guard) -> Self {
        match v {
            Guard::User => GuardId::new("user"),
            Guard::Admin => GuardId::new("admin"),
            Guard::<YourActor> => GuardId::new("<lowercase_actor>"),   // ← add this
        }
    }
}
```

**8b. Add `[auth.guards.<name>]` to `config/auth.toml`** (and any production `.env` overrides):

```toml
[auth.guards.<lowercase_actor>]
driver = "token"
```

**8c. Register in `AppServiceProvider`** — edit `src/providers/app_service_provider.rs`:

```rust
registrar.register_authenticatable::<<YourActor>>()?;
```

**8d. Impl blocks on the model**:

```rust
impl HasToken for <YourActor> {
    fn token_actor_id(&self) -> String {
        self.id.to_string()
    }
}

impl Authenticatable for <YourActor> {
    fn guard() -> GuardId {
        Guard::<YourActor>.into()
    }
}
```

See `./examples/authenticatable-model.md` for the complete end-to-end trace.

### 9-lifecycle. Add a `ModelLifecycle<M>` impl

Only if field-level `write_mutator` isn't enough (multi-field coordination, cross-field validation, in-transaction side effects). Read `./references/lifecycle-hooks.md`.

### 10-permissions. Add RBAC scope

Edit `src/ids/permissions.rs`:

```rust
pub enum Permission {
    // ... existing variants
    #[forge(key = "<resource>.read")]
    <Resource>Read,
    #[forge(key = "<resource>.manage")]
    <Resource>Manage,
}
```

Run `make types` to regenerate TypeScript bindings (the Permission enum is exported to TS for frontend permission checks).

Convention: `<resource>.read` for view, `<resource>.manage` for create/update/delete. The permission `.manage` implies `.read` via the `implied_permission` mapping in that file — extend if your resource follows that pattern.

### 11-seeder. Add dev-time data

Generate via the CLI scaffolder — **never hand-name the file**:

```bash
PROCESS=cli cargo run -- make:seeder --name <SnakeName>
```

This creates the seeder file in `database/seeders/` with the correct prefix + `impl SeederFile` skeleton. Edit the generated file and fill in the body using one of the patterns below.

**Baseline seeder files** (`000000000001_admin_seeder.rs`, `000000000001_user_seeder.rs`, `000000000001_countries_seeder.rs`, etc.) are **Forge-published baselines** written by `PROCESS=cli cargo run -- seed:publish`. Don't hand-edit them; don't mimic their naming for new app seeders — use `make:seeder`.

**PREFERRED — model-builder pattern (find-or-create):**

```rust
use async_trait::async_trait;
use forge::prelude::*;

use crate::domain::models::<YourModel>;

pub struct Entry;

#[async_trait]
impl SeederFile for Entry {
    async fn run(ctx: &SeederContext<'_>) -> Result<()> {
        let existing = <YourModel>::model_query()
            .where_eq(<YourModel>::<UNIQUE_FIELD>, "<expected_value>")
            .first(ctx.app())
            .await?;

        if existing.is_some() {
            return Ok(());
        }

        <YourModel>::model_create()
            .set(<YourModel>::<FIELD_1>, "<value>")
            .set(<YourModel>::<FIELD_2>, <YourEnum>::<Variant>)  // typed enum, not string
            .save(ctx.app())
            .await?;

        println!("  seeded <row description>");
        Ok(())
    }
}
```

Use the model builder by default. You get:
- Column constants (compile-time typo protection)
- Typed enum values (no stringly-typed `"pending"` mistakes)
- Field mutators fire automatically (e.g., password hashing via `write_mutator`)
- `ModelCreatedEvent` fires (badges and other listeners react)
- Consistent row shape across app-level and seed-level writes

**Raw SQL — only when the model builder cannot express the operation:**

```rust
ctx.raw_execute(
    r#"INSERT INTO <table> (<col_1>, <col_2>)
       VALUES ($1, $2)
       ON CONFLICT (<unique_col>) DO NOTHING"#,
    &[DbValue::Text("...".into()), DbValue::Text("...".into())],
)
.await?;
```

Use raw SQL only when:
- Seeding tens of thousands of rows where per-row builder overhead matters (rare; measure first)
- Bypassing mutators/events is **intentional** — e.g., seeding an already-hashed password from a production dump (rare, and usually wrong)
- The operation is pure DDL-adjacent (truncate, bulk-update-by-condition) where the builder has no equivalent

If you find yourself reaching for raw SQL, pause and ask whether a model builder covers it. 95% of the time it does.

**Seeder rules:**

- Must be **idempotent**. Running `make seed` twice must not duplicate rows or error.
- For password fields: pass **plaintext** via `.set(<Model>::PASSWORD_HASH, "plaintext")`; the model's `write_mutator` hashes at save. NEVER pre-hash. NEVER use raw SQL to write a hashed password — the mutator never runs.
- For file-I/O operations (attachments), override `fn run_in_transaction() -> bool { false }`.
- Declare any dependency on earlier seeders by number — seeders run in ascending numeric order.

Apply: `make seed`.

## Verify

Run in order, expect each clean:

```bash
make check         # cargo check — Rust compiles
make migrate       # migration applies (idempotent if already applied)
make types         # regenerate TS bindings (only needed if Permission enum changed or new DTOs exist)
make lint          # cargo clippy -D warnings + Biome
```

If you added a seeder:

```bash
make seed          # seeder runs; re-run to confirm idempotency
```

**End-to-end sanity** (optional, for complex models):

```bash
make dev
```

Open a REPL-like context (or add a throwaway test) and exercise `<YourModel>::model_create().set(...).save(&app).await?` to confirm the schema + model agree at runtime. Do not leave throwaway test code in the repo — use `cargo test` with `#[tokio::test(flavor = "multi_thread")] #[ignore = "..."]` patterned after `tests/user_baseline.rs` if the model warrants an integration test.

## Don't

- **Don't annotate models with `#[derive(ts_rs::TS)]`.** TypeScript is generated from response/request DTOs (in `src/portals/<portal>/{responses,requests}.rs`), not from models. Models are server-side only.
- **Don't use stringly-typed column references anywhere.** `<Model>::<FIELD>` (macro-generated), never raw strings. Same rule for enum values (`<Enum>::<Variant>`, never string literals).
- **Don't add a `deleted_at` column without `soft_deletes = true`** on the struct attribute, and vice versa. Forge's scoping relies on both being present.
- **Don't add `#[forge(belongs_to = ...)]` or similar relation attributes.** That macro attribute does NOT exist in this Forge version. Relations are hand-written with `belongs_to()` / `has_one()` / `has_many()` helper functions.
- **Don't register a non-authenticatable model with `register_authenticatable::<T>()?`.** `forge::register_generated_database!` already auto-discovers all `forge::Model` types. Explicit registration is only for login actors.
- **Don't mismatch FK Rust type vs target's PK type.** If target has `ModelId<Self>` → FK is `ModelId<Target>`. If target has manual `String` PK → FK is `String`. Getting this wrong breaks the query builder.
- **Don't hash passwords in seeders or callers.** The model's `write_mutator` hashes at save time. Passing already-hashed data results in double-hashing — no one can log in.
- **Don't skip the migration's `down()` function.** Always pair `up` + `down`. If the table creates dependent constraints, `down` must drop them in reverse order.
- **Don't put cross-cutting side effects in a `write_mutator` or `ModelLifecycle` impl.** Those are for intra-model concerns. Side effects that touch *other* models (badge counts, notifications, audit logs for unrelated entities) are `EventListener<ModelCreatedEvent>` / `Updated` / `Deleted` in a service provider.
- **Don't use raw SQL when the model builder covers the operation.** Seeders, services, and every in-app write path should go through `Model::model_create()`, `.update()`, `.delete()`. Raw SQL bypasses mutators (password hashing silently skipped), bypasses events (badge listeners never fire), and loses compile-time column safety. Migrations are the one permitted exception — DDL has no builder.
- **Don't put shared enums inside a model file.** If another model, service, or DTO might reference the enum, it belongs in `src/domain/enums/<name>.rs` and in `src/domain/enums/mod.rs`. A file-private helper enum (used by exactly one model file) can stay inline — but if in doubt, put it in `src/domain/enums/`. Matches CLAUDE.md: "One rule for enums — app-owned shared enums live in `src/domain/enums/`; file-private helper enums stay local to their module."
- **Don't put business logic in service-layer or route-handler locations that should live as a scoped query on the model.** If the same `.where_eq(Self::X, Y).where_(Self::Z.is_null())` appears in more than one place, promote it to `impl <Model> { pub fn <scope>() -> ModelQuery<Self> { ... } }`. The model is the single source of truth for its own query shapes.
- **Don't hand-create migration or seeder files.** Always use `PROCESS=cli cargo run -- make:migration --name <slug>` and `PROCESS=cli cargo run -- make:seeder --name <Name>`. The CLI applies the correct timestamp / naming prefix; hand-picking risks ordering collisions and breaks convention. Same rule for model + job files — use `make:model` / `make:job` to scaffold, then edit.
- **Don't mimic the `000000000001_*` style naming in your new migrations or seeders.** That prefix range is reserved for Forge-published baseline files (schema foundation: personal_access_tokens, notifications, metadata, attachments, countries, settings, users, admins). They're published into your project via `migrate:publish` / `seed:publish` and must NOT be hand-edited or copied in pattern. Your app-level files use the timestamp format produced by `make:migration` / `make:seeder`.
- **Don't install new Rust crates without asking** (CLAUDE.md global rule). `uuid`, `serde`, `async-trait`, `forge`, `tokio` are already available.
- **Don't rename `Cargo.toml` package or `[[bin]]` name** (CLAUDE.md rule). App identity comes from `.env` / `config/app.toml`.

## When this skill doesn't fit

- **Adding a column to an existing model** → no skill; write a migration (`ALTER TABLE`), add the field to the struct, run `make migrate && make check`. If the column is in any response DTO, run `make types`.
- **Adding a new domain enum** (not a model) → edit `src/domain/enums/mod.rs` + add the enum file with `#[derive(forge::AppEnum)]`. No skill exists; follow the pattern in `src/domain/enums/admin_type.rs`.
- **Adding a new Permission variant** → edit `src/ids/permissions.rs`; no skill. Don't forget `make types`.
- **Adding a list page backed by this model** → invoke `admin-datatable` after this skill completes.
- **Adding a sidebar count badge over this model** → invoke `admin-badge` after this skill completes.
- **Adding a new portal that has this model as its login actor** → invoke the `new-portal` skill.
- **Renaming or deleting an existing model** → escalate. Schema changes with FK implications need migration-order review; this skill does not cover destructive changes.
- **Implementing `HasTranslations` / `HasAttachments`** → read `./references/polymorphic-fk.md` after completing the core steps.
