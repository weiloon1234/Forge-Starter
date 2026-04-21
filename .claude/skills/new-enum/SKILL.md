---
name: new-enum
description: Use when adding a new app-owned enum with `#[derive(forge::AppEnum)]` — a typed finite set of string-keyed variants used across Rust models / DTOs / services and auto-exported to TypeScript as a union type + Options + Values + Meta. Typical phrasings: "add a TopUpStatus enum", "new enum for order status", "add a Priority enum with Low / Medium / High", "add a user tier enum". Covers the shared-vs-file-private placement decision, the `#[forge(key = "...")]` attribute for custom wire keys, the required i18n label keys (`enum.<snake_name>.<variant>`), and the `make types` regeneration + how the generated TS bindings are consumed on the frontend. Do NOT use for: enum-typed fields added to an existing model (that's part of `new-model`'s field composition — invoke `new-model`, and this skill when the enum itself is new); Forge-provided enums (import from `forge::`; never redeclare); generic Rust enums that are not user-facing / database-persisted / TS-exported (plain `enum X {}` without AppEnum is fine for internal use).
---

# New Enum — add an app-owned `forge::AppEnum` enum

## When to invoke

A developer needs a typed finite-set value that is persisted, appears in a DTO, drives a Select dropdown, or otherwise crosses the Rust↔TS boundary. Typical phrasings:

- "add a `TopUpStatus` enum with pending / approved / rejected"
- "new `Priority` enum (low / medium / high)"
- "add `OrderStatus`"
- "user tier enum"
- "categorize X with a fixed set of options"

Do NOT invoke for:
- **An enum-typed field on a model** — that's part of `new-model`'s field composition. If the enum already exists, no new-enum invocation. If the enum is also new, invoke `new-enum` first, then `new-model`.
- **A Forge-provided enum** (`forge::countries::CountryStatus`, `forge::settings::SettingType`, etc.) — import it; don't redeclare.
- **An internal Rust enum** used only in one module for logic flow (no persistence, no DTO, no TS surface) — plain `enum Foo {}` is fine. Don't reach for `forge::AppEnum` unless the enum needs to cross the serde / database / TS boundary.
- **Adding a variant to an existing AppEnum** — just edit the enum definition + add the matching i18n key + run `make types`. No skill needed for a single-variant addition.

## Concept

`#[derive(forge::AppEnum)]` on a Rust enum generates:

- **Serde (de)serialization** — each variant serializes to its string key (either the default snake_case of the variant name, or an explicit `#[forge(key = "...")]` value).
- **Database binding** — the enum can be a column type; stored as `TEXT` in PostgreSQL, never a PG `CREATE TYPE ... AS ENUM`. Variants round-trip through the string key.
- **TypeScript export** — `make types` emits `frontend/shared/types/generated/<Name>.ts` with four named exports (see `typescript` skill): the union `type`, `<Name>Values`, `<Name>Options` (with `labelKey` pointing to an i18n translation), `<Name>Meta`.
- **Frontend consumption** — `enumOptions(<Name>Options, t)` for Select dropdowns, `enumLabel(<Name>Options, value, t)` for translated display in table cells and badges.

The label-key convention: `enum.<snake_name>.<variant>` in every locale's `messages.json`. Without the i18n entry, `enumLabel` falls back to the raw key — which looks like "super_admin" instead of "Super Admin" in the UI.

## Prerequisites

- [ ] The enum genuinely crosses a boundary that needs the macro — otherwise plain `enum` is lighter.
- [ ] You know which placement tier applies (see Decision 1).

## Decisions — quick

### 1. Placement (per CLAUDE.md "One rule for enums")

- **Shared** — referenced by multiple models, services, or DTOs, OR surfaces on the frontend → **`src/domain/enums/<snake_name>.rs`** + exported from `src/domain/enums/mod.rs`. This is the default for anything the frontend touches.
- **File-private helper** — used only inside one model's file, never referenced elsewhere → declare inline above the struct in that model's `.rs` file. No export. Rare — most enums that deserve `AppEnum` are shared.
- **Forge-provided** — if one of Forge's built-in enums already covers the domain (`CountryStatus`, `SettingType`, etc.), use that. Never redeclare.

### 2. Variant keys (wire format)

- **Default** — variant name lowercased snake_case (`SuperAdmin` → `"super_admin"`). Fine for almost everything.
- **Custom via `#[forge(key = "...")]`** — when the wire representation must differ from the Rust identifier. Needed for the `Permission` enum (where keys are `"module.action"` dotted strings), and rarely for legacy wire compatibility.

### 3. Additional derives

Almost every enum wants `Clone, Copy, Debug, PartialEq, Eq`. Add `PartialOrd, Ord` if the enum will participate in `BTreeMap` / `BTreeSet` or sorted iteration (`Permission` uses Ord so its variants sort deterministically for RBAC computation).

## Steps

### 1. Create the enum file (if shared)

Path: `src/domain/enums/<snake_name>.rs`

```rust
use forge::prelude::*;

#[derive(Clone, Copy, Debug, PartialEq, Eq, forge::AppEnum)]
pub enum <YourEnum> {
    <VariantA>,
    <VariantB>,
    <VariantC>,
}
```

With explicit wire keys (only if needed):

```rust
#[derive(Clone, Copy, Debug, PartialEq, Eq, forge::AppEnum)]
pub enum <YourEnum> {
    #[forge(key = "<wire_key_a>")]
    <VariantA>,
    #[forge(key = "<wire_key_b>")]
    <VariantB>,
}
```

Add sorted derives if you need ordering:

```rust
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, forge::AppEnum)]
pub enum <YourEnum> { ... }
```

### 2. Export from the enums module

Edit `src/domain/enums/mod.rs`:

```rust
pub mod <snake_name>;
pub use <snake_name>::<YourEnum>;
```

(If the file is declaring file-private helper enums, skip this step — no export.)

### 3. Add i18n label keys for every locale

Edit `locales/en/messages.json`:

```json
{
  "enum": {
    "<snake_name>": {
      "<variant_a>": "<Human label A>",
      "<variant_b>": "<Human label B>",
      "<variant_c>": "<Human label C>"
    }
  }
}
```

Mirror in every other locale (`locales/zh/messages.json`, etc.). CLAUDE.md hard rule: non-English locales must contain every key the English file references.

The variant keys in JSON match the **wire key** (snake_case by default, or your `#[forge(key = "...")]` override — the text you'd put in a DB row). Not the Rust identifier.

### 4. Regenerate TypeScript

```bash
make types
```

This produces `frontend/shared/types/generated/<YourEnum>.ts` with four exports: the union type, `<YourEnum>Values`, `<YourEnum>Options`, `<YourEnum>Meta`. See the `typescript` skill for the exact shape.

### 5. Use from code

**Rust** — model fields, DTO fields, service logic:

```rust
use crate::domain::enums::<YourEnum>;

// In a model:
#[derive(Serialize, forge::Model)]
#[forge(model = "things")]
pub struct Thing {
    pub id: ModelId<Self>,
    pub status: <YourEnum>,
    // ...
}

// In a service query:
<YourEnum>::<VariantA>
Thing::model_query().where_eq(Thing::STATUS, <YourEnum>::<VariantA>).count(&*db).await?
```

Strongly typed — no strings at call sites.

**Frontend** — Select dropdowns, table cells:

```tsx
import { <YourEnum>Options } from "@shared/types/generated";
import { enumOptions, enumLabel } from "@shared/utils";

// In a Select:
<Select
  {...form.field("status")}
  label={t("Status")}
  options={enumOptions(<YourEnum>Options, t)}
/>

// In a table cell render:
render: (row) => enumLabel(<YourEnum>Options, row.status, t)
```

## File-private enum (rare)

When the enum is used only inside one model file and nowhere else, declare inline above the struct — no `src/domain/enums/` file, no `mod.rs` export:

```rust
// src/domain/models/some_thing.rs
use forge::prelude::*;
use serde::Serialize;

#[derive(Clone, Copy, Debug, PartialEq, Eq, forge::AppEnum)]
pub enum SomeThingKind {
    A,
    B,
}

#[derive(Serialize, forge::Model)]
#[forge(model = "some_things")]
pub struct SomeThing {
    pub id: ModelId<Self>,
    pub kind: SomeThingKind,
    pub created_at: DateTime,
    pub updated_at: Option<DateTime>,
}
```

Still gets TS export (anything `#[derive(forge::AppEnum)]` lands in `generated/`). Still needs `enum.some_thing_kind.<variant>` i18n keys. The only difference is no `src/domain/enums/` file.

**Upgrade to shared** — the moment a second module references the enum, move it to `src/domain/enums/` and update the import path. Don't leave private enums stranded.

## Verify

```bash
make check
make types
make lint
```

Confirm the generated TS file:

```bash
cat frontend/shared/types/generated/<YourEnum>.ts
```

Expect: union type, Values, Options, Meta — four named exports. Options' `labelKey` matches `enum.<snake_name>.<variant>`.

Open `frontend/shared/types/generated/index.ts` and verify the barrel re-exports the new file's named bindings.

## Don't

- **Don't use string literals where a typed enum variant exists.** Rust: `<YourEnum>::<VariantA>`, not `"<variant_a>"`. Frontend: `<YourEnum>Values[0]` or the typed `type`, not bare string unions.
- **Don't skip the i18n keys.** Without `enum.<snake_name>.<variant>` entries, `enumLabel` falls back to the wire key on the frontend — ugly UX.
- **Don't skip non-English locales.** Every variant must have a translation in every locale file. CLAUDE.md hard rule.
- **Don't put a shared enum inline in a model file** to save a file. If the enum could be referenced elsewhere (DTO fields, service return types, another model), it belongs in `src/domain/enums/`.
- **Don't redeclare a Forge-provided enum.** `CountryStatus`, `SettingType`, etc. — import from `forge::`. Redeclaring would produce a duplicate TS file on regeneration.
- **Don't use `CREATE TYPE ... AS ENUM` in migrations.** AppEnum fields are stored as `TEXT`. A PostgreSQL enum type doesn't round-trip through the `forge::AppEnum` macro.
- **Don't add a variant without updating every consumer + i18n.** A new variant reaches every match arm, every DTO consumer, every locale file. Skipping any produces silent fallback at best, compile errors at worst (in Rust, match arms are exhaustive).
- **Don't rename an existing variant's wire key.** Rows persisted under the old key will fail to deserialize. Treat wire keys as contract.

## When this skill doesn't fit

- **Enum-typed field on a model** — combine with `new-model`. If the enum is new, run this skill first. If existing, just reference it in `new-model`'s field template.
- **Adding a single variant to an existing enum** — no skill. Add variant + i18n key + `make types`. Update every match arm the compiler flags.
- **Permission enum variants specifically** — use `new-permission` (specialized for the Permission enum's `key_str`/`module`/`action`/`implied_permission` conventions).
- **Non-string-keyed enum** (integer-keyed, e.g., some legacy DB columns) — AppEnum supports integer keys via `forge(key = ...)` with integer, but this is rare. Escalate if you need it.
- **Internal Rust enum with no persistence / DTO / TS exposure** — plain `enum Foo {}` is fine; AppEnum overhead isn't earned.
