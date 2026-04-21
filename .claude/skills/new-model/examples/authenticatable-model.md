# Example: Authenticatable login-actor model — the full trace

Read this when the `new-model` skill's decision guide resolves to "authenticatable login actor" — a model that logs in via the starter's token auth system. Examples from the existing codebase: `User`, `Admin`. This example walks through adding a hypothetical `Merchant` actor — same shape you'd use for `Partner`, `Vendor`, `Reseller`, or any non-user non-admin role with its own login flow.

This is the **most error-prone variant in the codebase**. Follow the steps exactly. Each touch is load-bearing — skipping any one produces a model that compiles but fails at runtime (guard not found, token not issued, login route 500s).

## File touches — 7 mandatory

| # | File | Action | Purpose |
|---|---|---|---|
| 1 | `src/domain/models/merchant.rs` | Generate via `make:model`, then edit | Model struct + password mutator + Authenticatable + HasToken |
| 2 | `src/domain/models/mod.rs` | Edit | Export the model |
| 3 | `database/migrations/{timestamp}_create_merchants.rs` | Generate via `make:migration`, then edit | Table schema |
| 4 | `src/ids/guards.rs` | Edit | Add `Guard::Merchant` variant |
| 5 | `config/auth.toml` | Edit | Add `[auth.guards.merchant]` block |
| 6 | `src/providers/app_service_provider.rs` | Edit | Call `register_authenticatable::<Merchant>()?` |
| 7 | `database/seeders/{timestamp}_merchant_seeder.rs` | Generate via `make:seeder`, then edit (optional) | Dev-time credentials |

Apply with `make migrate && make seed && make check`.

## 1. Model file

Generate the scaffold:

```bash
PROCESS=cli cargo run -- make:model --name Merchant
```

Then edit `src/domain/models/merchant.rs` to this content:

```rust
use forge::prelude::*;
use serde::Serialize;

use crate::ids::guards::Guard;

#[derive(Serialize, forge::Model)]
#[forge(model = "merchants", soft_deletes = true)]
pub struct Merchant {
    pub id: ModelId<Self>,
    pub username: String,
    pub email: String,
    pub name: String,
    #[serde(skip)]
    #[forge(write_mutator = "hash_password")]
    pub password_hash: String,
    pub locale: String,
    pub created_at: DateTime,
    pub updated_at: DateTime,
    pub deleted_at: Option<DateTime>,
}

impl Merchant {
    async fn hash_password(ctx: &ModelHookContext<'_>, value: String) -> Result<String> {
        ctx.app().hash()?.hash(&value)
    }
}

impl HasToken for Merchant {
    fn token_actor_id(&self) -> String {
        self.id.to_string()
    }
}

impl Authenticatable for Merchant {
    fn guard() -> GuardId {
        Guard::Merchant.into()
    }
}
```

**Notes on each piece:**

- `#[forge(model = "merchants", soft_deletes = true)]` — plural snake_case table, soft-delete so deactivated merchants can be restored and FKs referencing them don't orphan.
- `soft_deletes = true` requires the `deleted_at: Option<DateTime>` field. Forge's query builder will exclude soft-deleted rows by default; use `.with_trashed()` when you explicitly want them.
- `password_hash: String` with `#[serde(skip)]` — never serialize the hash to API responses. `#[forge(write_mutator = "hash_password")]` — the mutator hashes plaintext at save time.
- `hash_password` is a **private** `async fn` inside the `impl Merchant { ... }` block. Forge discovers it by name match; it must not be `pub` and must not live outside the impl block.
- Both `created_at` and `updated_at` are `DateTime` (non-nullable) — auth-style. This differs from the "standard" pattern (`updated_at: Option<DateTime>`) because auth actors are mutated often enough that an "ever-updated?" null isn't useful.
- `HasToken::token_actor_id` returns the primary key as a string. Used to encode the actor inside issued tokens.
- `Authenticatable::guard()` returns the Guard ID that this model is bound to. Must match the variant added in step 4 and the TOML block added in step 5.

## 2. Module export

Path: `src/domain/models/mod.rs`

Add alphabetically:

```rust
pub mod merchant;
// ...
pub use merchant::Merchant;
```

## 3. Migration

Generate the scaffold:

```bash
PROCESS=cli cargo run -- make:migration --name create_merchants
```

Then edit the generated `database/migrations/{YYYYMMDDhhmm}_create_merchants.rs`:

```rust
use async_trait::async_trait;
use forge::prelude::*;

pub struct Entry;

#[async_trait]
impl MigrationFile for Entry {
    async fn up(ctx: &MigrationContext<'_>) -> Result<()> {
        ctx.raw_execute(
            r#"
            CREATE TABLE merchants (
                id UUID PRIMARY KEY DEFAULT uuidv7(),
                username TEXT NOT NULL,
                email TEXT NOT NULL,
                name TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                locale TEXT NOT NULL DEFAULT 'en',
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                deleted_at TIMESTAMPTZ
            )
            "#,
            &[],
        )
        .await?;

        // Unique lookup indexes, active-only (exclude soft-deleted).
        ctx.raw_execute(
            r#"CREATE UNIQUE INDEX idx_merchants_username_active
               ON merchants (LOWER(username))
               WHERE deleted_at IS NULL"#,
            &[],
        )
        .await?;
        ctx.raw_execute(
            r#"CREATE UNIQUE INDEX idx_merchants_email_active
               ON merchants (LOWER(email))
               WHERE deleted_at IS NULL"#,
            &[],
        )
        .await?;
        ctx.raw_execute(
            "CREATE INDEX idx_merchants_created_at ON merchants (created_at)",
            &[],
        )
        .await?;

        Ok(())
    }

    async fn down(ctx: &MigrationContext<'_>) -> Result<()> {
        ctx.raw_execute("DROP TABLE IF EXISTS merchants", &[])
            .await?;
        Ok(())
    }
}
```

**Migration notes:**

- `deleted_at TIMESTAMPTZ` (nullable, no default) — pairs with `soft_deletes = true`.
- Partial unique indexes on `LOWER(username)` and `LOWER(email)` with `WHERE deleted_at IS NULL` — case-insensitive unique constraint that ignores soft-deleted rows. A merchant can re-register with the same email after their old record is soft-deleted.
- Both `created_at` and `updated_at` have `DEFAULT NOW()` and `NOT NULL` — matches the model's `DateTime` (non-optional) typing.

## 4. Guard variant

Path: `src/ids/guards.rs`

Add `Merchant` variant:

```rust
pub enum Guard {
    User,
    Admin,
    Merchant,   // ← new
}

impl From<Guard> for GuardId {
    fn from(v: Guard) -> Self {
        match v {
            Guard::User => GuardId::new("user"),
            Guard::Admin => GuardId::new("admin"),
            Guard::Merchant => GuardId::new("merchant"),   // ← new
        }
    }
}
```

The string `"merchant"` must match the `[auth.guards.merchant]` block in the next step.

## 5. Auth config

Path: `config/auth.toml`

Append a new guard block:

```toml
[auth.guards.merchant]
driver = "token"
```

The TTL fields (`access_token_ttl_minutes`, `refresh_token_ttl_days`) typically live in a shared `[auth.tokens]` block rather than per-guard — don't duplicate unless you need per-guard overrides.

For production, override via `.env` using the double-underscore notation per CLAUDE.md:

```
AUTH__GUARDS__MERCHANT__DRIVER=token
```

## 6. Provider registration

Path: `src/providers/app_service_provider.rs`

Add the `register_authenticatable::<Merchant>()?` call:

```rust
use crate::domain::models::{Admin, Merchant, User};

#[async_trait]
impl ServiceProvider for AppServiceProvider {
    async fn register(&self, registrar: &mut ServiceRegistrar) -> Result<()> {
        registrar.register_authenticatable::<User>()?;
        registrar.register_authenticatable::<Admin>()?;
        registrar.register_authenticatable::<Merchant>()?;   // ← new
        // ... rest
    }
}
```

Without this call, `Merchant` cannot resolve from an authenticated request. The token-auth middleware looks up actors by guard ID via the registered authenticatables list.

## 7. Seeder (optional)

Generate the scaffold:

```bash
PROCESS=cli cargo run -- make:seeder --name MerchantSeeder
```

Then edit the generated `database/seeders/{prefix}_merchant_seeder.rs`. Prefer the model-builder pattern so the `hash_password` mutator runs automatically:

```rust
use async_trait::async_trait;
use forge::prelude::*;

use crate::domain::models::Merchant;

pub struct Entry;

#[async_trait]
impl SeederFile for Entry {
    async fn run(ctx: &SeederContext<'_>) -> Result<()> {
        let existing = Merchant::model_query()
            .where_eq(Merchant::USERNAME, "dev_merchant")
            .first(ctx.app())
            .await?;

        if existing.is_some() {
            return Ok(());
        }

        Merchant::model_create()
            .set(Merchant::USERNAME, "dev_merchant")
            .set(Merchant::EMAIL, "merchant@localhost")
            .set(Merchant::NAME, "Dev Merchant")
            .set(Merchant::PASSWORD_HASH, "devpassword")   // PLAINTEXT — mutator hashes
            .set(Merchant::LOCALE, "en")
            .save(ctx.app())
            .await?;

        println!("  seeded merchant: dev_merchant");
        Ok(())
    }
}
```

**Critical:** pass plaintext to `PASSWORD_HASH`. The `hash_password` mutator hashes at save. Pre-hashing or using raw SQL to `INSERT` a bcrypt string produces a row where login fails (double-hash mismatch).

## Apply and verify

```bash
make migrate    # table exists
make seed       # dev merchant created
make check      # compiles
make lint       # no warnings
```

## What's NOT in this example (but is downstream)

- **Merchant login / refresh / logout routes** — the authenticatable plumbing is in place, but actual REST routes (`POST /merchant/auth/login`, etc.) are per-portal concerns. Either add them to an existing portal or create a new portal (invoke the `new-portal` skill).
- **Merchant-scoped permissions** — if merchants have role-like permissions, add variants to `src/ids/permissions.rs` and a `permissions: Vec<String>` column. Adjust this example: copy Admin's shape.
- **Merchant-specific domain methods** — scoped queries like `Merchant::active()`, terminal queries like `Merchant::find_active_by_username`, computed accessors. Add as real use-cases appear; see `../SKILL.md`'s "Optional domain methods" section.
- **Merchant portal frontend** — if merchants log in via a browser, create a new portal (invoke the `new-portal` skill). If they hit API-only endpoints, skip the frontend work.

## Sanity check after all seven steps

```rust
// From a handler or service (after registrar.register_authenticatable::<Merchant>()? runs):
let found = Merchant::model_query()
    .where_eq(Merchant::USERNAME, "dev_merchant")
    .first(&app)
    .await?;
assert!(found.is_some());

// Password verification uses the same hash infrastructure:
let merchant = found.unwrap();
let hasher = app.hash()?;
assert!(hasher.verify("devpassword", &merchant.password_hash)?);
```

If the hash verification fails, the seeder or the mutator is wrong. If the lookup fails, check `make migrate` output and confirm the row exists via `psql` or a raw query.

If a login route rejects the token, check step 6 (provider registration) and step 5 (auth.toml) — those are the two most-commonly-missed steps.
