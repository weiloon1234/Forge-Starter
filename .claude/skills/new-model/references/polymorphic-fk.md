# Reference: Polymorphic foreign keys — STUB

**Status:** Two polymorphic patterns exist in the starter (`PageTranslation` via `HasTranslations` trait; `CreditTransaction::related_key` via phantom `CreditRelatedKey` marker), but adding a new polymorphic model from scratch hasn't been exercised since the patterns landed. This reference is a stub — full content fills in when a real use-case surfaces.

## When you'd need this

A single FK column that can reference rows across multiple tables. Examples:

- **Translations** — one `model_translations` table holds translated strings for pages, products, categories, etc. Each row has `translatable_type` (the target table name) + `translatable_id` (the PK in that table).
- **Attachments / media** — one table of uploaded files associated with arbitrary owner records.
- **Audit log entries** — one table logging actions against diverse subjects.
- **Credit transaction subjects** — `CreditTransaction::related_key` + `related_type` links a transaction to whichever domain record drove it.

## Two patterns in the starter today

### A. `HasTranslations` / `HasAttachments` — Forge-supplied traits

Read the current implementations:

- **`Page` impls `HasTranslations` + `HasAttachments`** — `src/domain/models/page.rs`
- **`PageTranslation` is the target table** — `src/domain/models/page_translation.rs`. It has `translatable_type: String` (the source table name) and `translatable_id: ModelId<Page>` (typed but would be `ModelId<SomeOther>` if `translatable_type` were different).

The trait impls require:

```rust
#[async_trait::async_trait]
impl HasTranslations for Page {
    fn translatable_type() -> &'static str { "pages" }
    fn translatable_id(&self) -> String { self.id.to_string() }
}
```

This wires Forge's translation runtime so `page.translation(&app, "en", "title").await?` and `page.set_translation(...)` work. When adding a model that participates as a translatable, impl the trait and Forge handles the rest.

### B. Phantom-typed `ModelId<K>` + string `related_type` — ad-hoc

`CreditTransaction` uses this: `related_key: Option<ModelId<CreditRelatedKey>>` + `related_type: Option<String>`. The `CreditRelatedKey` struct has no fields — it's a phantom type marker so the `ModelId<K>` newtype discipline is preserved even when the key could point at many real tables.

```rust
pub struct CreditRelatedKey;   // phantom

pub struct CreditTransaction {
    // ...
    pub related_key: Option<ModelId<CreditRelatedKey>>,
    pub related_type: Option<String>,
    // ...
}
```

Callers that interpret `related_key` must match on `related_type` to know which table to look up.

## When to use each

- **`HasTranslations` / `HasAttachments`** — when Forge ships a trait for the feature. You get the full runtime (translation fetching, attachment upload + storage, cascade on owner delete). Always prefer this when applicable.
- **Phantom `ModelId<K>` + `related_type`** — when you're building a custom polymorphic relationship Forge doesn't cover. Rare. Requires writing the dispatch logic at the service layer — no generic "load the related object" helper.

## Escalation

If you're adding a new polymorphic model from scratch (not just impl'ing a trait on an existing model):

1. **Read the existing implementations** — `Page`, `PageTranslation`, `CreditTransaction` source files. Mirror whichever closest matches your need.
2. **If both existing patterns don't fit, stop and ask the user.** Polymorphism has runtime + schema implications (indexing strategy, FK constraints — which you can't declare at the DB level because the target table varies) that deserve a design conversation.
3. When a new polymorphic model does land, fill in this reference with:
   - The decision criteria (which pattern and why)
   - The exact migration + model shape
   - How FK constraints are (or aren't) enforced
   - How the service layer dispatches on `related_type` / `translatable_type`
   - Any index strategy for `(type, id)` composite lookups

## Schema implications to bring to the design conversation

- **You cannot declare a real FK constraint** on a polymorphic column — `REFERENCES` requires a single target table. Either skip the constraint (data integrity becomes the app's problem) or normalize into one table per owner type.
- **Indexing strategy** — composite `(type, id)` index is usually necessary for lookup performance.
- **Cascade on owner delete** — no DB-level cascade (no FK), so you need either a lifecycle hook / event listener to delete dependent rows, or an explicit cleanup path.
- **Typed access patterns** — casting `ModelId<PhantomKey>` to a concrete `ModelId<Real>` at the service layer needs a conversion helper. Document it in the reference when it's written.
