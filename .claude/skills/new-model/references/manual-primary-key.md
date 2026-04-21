# Reference: Manual String primary key — Country-style reference data

Read this when the `new-model` skill's decision guide resolves to "reference data with manual PK" — a model keyed by an external code (ISO-2 country, ISO-4217 currency, IETF language tag, IANA timezone). The only existing example in the starter is `Country`.

## When to use a manual String PK

- The primary key is an **external well-known identifier**: `"MY"`, `"USD"`, `"en-US"`, `"Asia/Kuala_Lumpur"`.
- The codebase and database would both be more readable with the code-as-key than a synthetic UUID.
- The set of valid keys is bounded or slow-changing, and external systems reference rows by the code.

Do NOT use a manual PK for application-generated data (users, orders, anything with its own identity). Stick with `ModelId<Self>` (UUIDv7). Application models change more often than reference data; UUIDs stay stable when codes migrate, rebrand, or get typo-corrected.

## Model shape

```rust
use forge::prelude::*;
use serde::Serialize;

#[derive(Serialize, forge::Model)]
#[forge(
    model = "currencies",
    primary_key = "code",
    primary_key_strategy = "manual"
)]
pub struct Currency {
    pub code: String,            // the PK — no `ModelId<Self>` field
    pub name: String,
    pub symbol: Option<String>,
    pub decimal_places: i32,
    pub is_active: bool,
    pub created_at: DateTime,
    pub updated_at: Option<DateTime>,
}
```

Key attributes:

- `primary_key = "code"` — tells Forge which field is the PK.
- `primary_key_strategy = "manual"` — tells Forge not to auto-generate the PK. Callers must pass it explicitly on create.
- **No `pub id: ModelId<Self>`** field. The macro would refuse to compile with both.

## Migration

```rust
use async_trait::async_trait;
use forge::prelude::*;

pub struct Entry;

#[async_trait]
impl MigrationFile for Entry {
    async fn up(ctx: &MigrationContext<'_>) -> Result<()> {
        ctx.raw_execute(
            r#"
            CREATE TABLE currencies (
                code CHAR(3) PRIMARY KEY,
                name TEXT NOT NULL,
                symbol TEXT,
                decimal_places INT NOT NULL DEFAULT 2,
                is_active BOOLEAN NOT NULL DEFAULT true,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ
            )
            "#,
            &[],
        )
        .await?;
        Ok(())
    }

    async fn down(ctx: &MigrationContext<'_>) -> Result<()> {
        ctx.raw_execute("DROP TABLE IF EXISTS currencies", &[]).await?;
        Ok(())
    }
}
```

Note `CHAR(3) PRIMARY KEY` — fixed-width for ISO-4217 currency codes. For variable-width codes (IANA timezones), use `TEXT PRIMARY KEY`.

## Foreign keys *to* a manual-PK model

Any other model that references `Currency` uses **`String`** as the FK type — NOT `ModelId<Currency>`:

```rust
pub struct Price {
    pub id: ModelId<Self>,
    pub currency_code: String,      // FK to Currency — String, not ModelId<Currency>
    pub amount: Numeric,
    // ...
    #[serde(skip)]
    pub currency: Loaded<Option<Currency>>,
}

impl Price {
    pub fn currency() -> RelationDef<Self, Currency> {
        let foreign_key: Column<Self, String> =
            Column::new("prices", "currency_code", DbType::Text);
        belongs_to(
            foreign_key,
            Currency::CODE,
            |price| Some(price.currency_code.clone()),
            |price, currency| price.currency = Loaded::new(currency),
        )
        .named("currency")
    }
}
```

The migration for `prices`:

```sql
currency_code CHAR(3) NOT NULL REFERENCES currencies(code) ON DELETE RESTRICT ON UPDATE CASCADE
```

`ON UPDATE CASCADE` is often desirable here — if a currency code gets corrected, dependent rows follow.

## Seeding

Use the model-builder find-or-create pattern. Pass the PK explicitly:

```rust
use async_trait::async_trait;
use forge::prelude::*;

use crate::domain::models::Currency;

pub struct Entry;

#[async_trait]
impl SeederFile for Entry {
    async fn run(ctx: &SeederContext<'_>) -> Result<()> {
        for (code, name, symbol, decimals) in [
            ("USD", "US Dollar", Some("$"), 2),
            ("EUR", "Euro", Some("€"), 2),
            ("JPY", "Japanese Yen", Some("¥"), 0),
            ("MYR", "Malaysian Ringgit", Some("RM"), 2),
        ] {
            let existing = Currency::model_query()
                .where_eq(Currency::CODE, code)
                .first(ctx.app())
                .await?;

            if existing.is_some() {
                continue;
            }

            Currency::model_create()
                .set(Currency::CODE, code)
                .set(Currency::NAME, name)
                .set(Currency::SYMBOL, symbol.map(str::to_string))
                .set(Currency::DECIMAL_PLACES, decimals)
                .save(ctx.app())
                .await?;

            println!("  seeded currency: {code}");
        }
        Ok(())
    }
}
```

For large reference datasets (every ISO country, every IANA timezone), raw SQL with `ON CONFLICT DO NOTHING` is acceptable — see `forge::countries::seed_countries_with` for Forge's bulk-loader pattern.

## Query patterns

Identical to any other model, but queries use `Model::CODE` (or whatever PK field name) instead of `Model::ID`:

```rust
let usd = Currency::model_query()
    .where_eq(Currency::CODE, "USD")
    .first(&app)
    .await?;
```

## Gotchas

- **Don't mix `ModelId<Self>` with `primary_key_strategy = "manual"`.** Forge's macro rejects the combination.
- **Don't forget `REFERENCES <table>(<pk_column>)`** when adding FKs — the PK column name isn't `id`, so specifying it is mandatory.
- **`ON UPDATE CASCADE` is often correct** for external-code PKs (codes change less than you'd think, but they do change — ISO-8601 added several country codes since 2000). For UUID PKs, `ON UPDATE` is irrelevant (UUIDs don't change).
- **Uniqueness is implicit in the PK** — no separate `UNIQUE` constraint needed on the code column.
- **Case sensitivity matters.** ISO codes are usually uppercase. If your code accepts mixed-case input and normalizes, do it in a `write_mutator` or at the service layer before calling `.set(Model::CODE, ...)`.

## Real-world reference

- `Country` — `src/domain/models/country.rs`, migration `database/migrations/000000000002_create_countries.rs` (or wherever the countries migration lives). Uses `iso2: String` as PK with `primary_key = "iso2"` + `primary_key_strategy = "manual"`. Seeded via `forge::countries::seed_countries_with` bulk loader.
