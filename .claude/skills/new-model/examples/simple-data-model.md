# Example: Simple data model — the 3-file minimum

Read this when the `new-model` skill's decision guide resolves to a plain domain entity: `ModelId<Self>` PK, standard timestamps, no soft-delete, no FKs, no auth, no special lifecycle. This is the 80% case.

This example walks through adding a `Widget` model with just `id`, `name`, `created_at`, `updated_at`. Every file touch shown below is mandatory; there are no optional steps.

## File touches — exactly 3

| # | File | Action |
|---|---|---|
| 1 | `src/domain/models/widget.rs` | Generate via `make:model`, then edit |
| 2 | `src/domain/models/mod.rs` | Add `pub mod` + `pub use` |
| 3 | `database/migrations/{timestamp}_create_widgets.rs` | Generate via `make:migration`, then edit |

Then: `make migrate && make check`. That's it.

## 1. Model file

Generate the scaffold (don't hand-create):

```bash
PROCESS=cli cargo run -- make:model --name Widget
```

This produces `src/domain/models/widget.rs` with the module skeleton. Edit it to the content below:

```rust
use forge::prelude::*;
use serde::Serialize;

#[derive(Serialize, forge::Model)]
#[forge(model = "widgets")]
pub struct Widget {
    pub id: ModelId<Self>,
    pub name: String,
    pub created_at: DateTime,
    pub updated_at: Option<DateTime>,
}
```

That's the whole file. No `impl` block is required for the minimal case — no field mutators, no relations, no computed methods. Add those later when real use-cases demand them.

## 2. Module export

Path: `src/domain/models/mod.rs`

Add the module declaration in alphabetical order and the `pub use`:

```rust
// ... existing pub mod declarations
pub mod widget;

// ... existing pub use declarations
pub use widget::Widget;
```

## 3. Migration

Generate the scaffold (don't hand-name):

```bash
PROCESS=cli cargo run -- make:migration --name create_widgets
```

This creates `database/migrations/{YYYYMMDDhhmm}_create_widgets.rs` with empty `up` + `down`. Edit its body:

```rust
use async_trait::async_trait;
use forge::prelude::*;

pub struct Entry;

#[async_trait]
impl MigrationFile for Entry {
    async fn up(ctx: &MigrationContext<'_>) -> Result<()> {
        ctx.raw_execute(
            r#"
            CREATE TABLE widgets (
                id UUID PRIMARY KEY DEFAULT uuidv7(),
                name TEXT NOT NULL,
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
        ctx.raw_execute("DROP TABLE IF EXISTS widgets", &[]).await?;
        Ok(())
    }
}
```

No indexes are strictly required for a minimal model. Add them in future migrations when query patterns surface (search column, FK, sort column with data volume).

## Apply and verify

```bash
make migrate
make check
```

Both should be clean. If `make check` emits a warning about an unused import or dead-code in the model file, that's expected until a caller references it — leave it.

## What you can do now

The model is queryable immediately:

```rust
// Create
let widget = Widget::model_create()
    .set(Widget::NAME, "Alpha")
    .save(&app)
    .await?;

// Read by ID
let widget = Widget::model_query()
    .where_eq(Widget::ID, widget.id)
    .first(&app)
    .await?;

// List all
let widgets = Widget::model_query()
    .order_by(Widget::CREATED_AT.desc())
    .get(&app)
    .await?;

// Count
let n = Widget::model_query().count(&app).await?;

// Update
let widget = widget
    .update()
    .set(Widget::NAME, "Alpha Prime")
    .save(&app)
    .await?;

// Delete (hard — no soft-delete configured)
widget.delete().execute(&app).await?;
```

All column references use `Widget::NAME`, `Widget::ID`, `Widget::CREATED_AT` — never strings. The `#[derive(forge::Model)]` macro generates these constants at compile time.

## What's deliberately NOT in this example

- **No soft-delete** — add `soft_deletes = true` + `deleted_at: Option<DateTime>` only when there's a recover-deleted requirement. For a plain lookup table, hard-delete is fine.
- **No `impl Widget { ... }`** — scoped queries, computed accessors, and relation methods only exist when needed. Empty-impl-blocks are noise.
- **No seeder** — seed data is optional. Add one only if dev / prod needs pre-populated rows.
- **No admin page / datatable / badge** — downstream concerns. After the model lands, invoke the `admin-datatable` skill for a CRUD page or the `admin-badge` skill for a sidebar count.
- **No response DTO** — response shapes live in `src/portals/<portal>/responses/<resource>.rs` and are added per-route. Models themselves are not exported to TypeScript.

## When your model needs more than this

Walk back to `../SKILL.md` and answer the decision guide again. If any of these apply, your model is past "simple":

- Belongs to / has_one / has_many relation → FK field + `Loaded<...>` field + relation method
- Status/kind/type enum → decide shared vs file-private; use typed enum column
- Password field → `#[forge(write_mutator = "...")]` + async hash fn
- Can be deleted but recoverable → soft-delete
- Manual PK (external code like ISO-2) → `primary_key = "..."` + `primary_key_strategy = "manual"`
- Login actor → read `./authenticatable-model.md` (not this file)
- Polymorphic subject → read `../references/polymorphic-fk.md`
