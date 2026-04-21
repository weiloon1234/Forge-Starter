# Reference: `ModelLifecycle<M>` hooks — STUB

**Status:** Not yet exercised in the starter. Every existing model uses field-level `#[forge(write_mutator = "fn")]` for per-field transformations; none uses a full `ModelLifecycle<M>` impl. This reference is a stub — it will be filled in when a real use case surfaces.

## When you'd need this

Field mutators handle one field at a time. `ModelLifecycle<M>` is needed when:

- **Multi-field coordination at save time** — derive field B from field A whenever either changes.
- **Cross-field validation that can't live in the DB** — "if `kind == Premium`, `tier_code` must be set".
- **In-transaction side effects on the same model** — write an audit row to a sibling table atomically with the main save.

If the side effect touches **different models entirely** (update a badge count, notify another user, trigger a webhook), don't use `ModelLifecycle`. Use `EventListener<ModelCreatedEvent>` / `Updated` / `Deleted` in a service provider — the badge system is the canonical precedent.

## Escalation

If you hit a genuine need for `ModelLifecycle<M>` while working through the `new-model` skill:

1. **Stop and ask the user** — this pattern isn't proven in the starter yet. Adopting it touches `#[forge(lifecycle = "...")]` macro attributes and Forge-framework-level integration that haven't been tested against this codebase.
2. Show the user the specific requirement that field mutators + event listeners cannot satisfy.
3. If approved, this reference gets filled in as part of landing the feature — bringing forward the starter's first real `ModelLifecycle` usage.

## Forge trait surface (for reference only)

From `forge::database::model` (Forge framework source, not the starter):

```rust
#[async_trait]
pub trait ModelLifecycle<M>: Send + Sync + 'static
where
    M: Model,
{
    async fn creating(context: &ModelHookContext<'_>, draft: &mut CreateDraft<M>) -> Result<()> { Ok(()) }
    async fn created(context: &ModelHookContext<'_>, created: &M, record: &DbRecord) -> Result<()> { Ok(()) }
    async fn updating(context: &ModelHookContext<'_>, current: &M, draft: &mut UpdateDraft<M>) -> Result<()> { Ok(()) }
    async fn updated(context: &ModelHookContext<'_>, before: &M, after: &M, before_record: &DbRecord, after_record: &DbRecord) -> Result<()> { Ok(()) }
    async fn deleting(context: &ModelHookContext<'_>, current: &M, record: &DbRecord) -> Result<()> { Ok(()) }
    async fn deleted(context: &ModelHookContext<'_>, deleted: &M, record: &DbRecord) -> Result<()> { Ok(()) }
}
```

Binding to a model:

```rust
#[derive(Serialize, forge::Model)]
#[forge(model = "widgets", lifecycle = "WidgetLifecycle")]
pub struct Widget { /* ... */ }

pub struct WidgetLifecycle;

#[async_trait]
impl ModelLifecycle<Widget> for WidgetLifecycle {
    async fn creating(ctx: &ModelHookContext<'_>, draft: &mut CreateDraft<Widget>) -> Result<()> {
        // e.g. derive a field
        Ok(())
    }
}
```

The `WidgetLifecycle` type must be in scope at the model file. If a real integration happens, document here:
- Which model adopted it first
- What the derived field / validation / side effect actually does
- Whether the hook runs inside or outside the transaction (Forge's docs say in-transaction)
- Any gotchas around the provided `CreateDraft<M>` / `UpdateDraft<M>` surfaces
