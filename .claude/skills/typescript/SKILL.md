---
name: typescript
description: Use when a developer needs to understand or extend the Rust-to-TypeScript type generation in this project. Typical phrasings: "how do TS types get generated?", "add a field and get it in TypeScript", "why isn't my DTO showing up in the frontend types?", "what TypeScript does Forge auto-generate?", "how do I reference an enum from TypeScript?", "add a #[ts(...)] override for field X", "regenerate types after adding a DTO". Covers the full pipeline: ts_rs annotations on Rust DTOs, forge::AppEnum auto-generation for shared enums, the `make types` command, and the `@shared/types/generated` frontend import surface. Do NOT use for: changing frontend TypeScript that consumes generated types (regular frontend work); writing a brand-new DTO as part of a larger feature (use the feature's own skill — e.g., `admin-datatable`); tsconfig.json or Biome configuration; or frontend build/Vite errors unrelated to generation.
---

# TypeScript — Rust → TS generation pipeline

## When to invoke

A developer asks about the type generation pipeline, or wants to extend it. Typical phrasings:

- "how do TS types get generated?"
- "I added a field, how do I get it into TypeScript?"
- "why isn't my `FooResponse` showing up in the frontend types?"
- "what TS does Forge auto-generate for my enum?"
- "how do I reference `AdminType` from TypeScript?"
- "add a `#[ts(type = ...)]` override for a `BTreeMap` field"
- "regenerate types after adding a DTO"

Do NOT invoke for:
- Consuming generated types in React (regular frontend work — just `import type` and use it).
- Writing a fresh DTO as part of a full feature (the feature's own skill — `admin-datatable`, etc. — covers the whole shape; this skill is called only if the pipeline itself needs tweaking).
- Editing `tsconfig.json` / Biome / Vite configuration.
- Frontend compile errors unrelated to generation (e.g., your own hand-written TS is wrong).

## Concept

The pipeline is fully macro-driven. In a Rust source file you add a `ts_rs::TS` + `forge::ApiSchema` (or `forge::AppEnum`, for enums) derive with `#[ts(export)]`. Running `make types` invokes the Forge CLI (`cargo run -- types:export`), which walks every registered schema in the binary and emits one `.ts` file per exported type into `frontend/shared/types/generated/`, plus an auto-maintained `index.ts` barrel. The frontend imports via the `@shared/*` path alias — `import type { AdminResponse } from "@shared/types/generated"`. No hand-written types for anything that crosses the Rust↔TS boundary.

## What gets exported vs. what doesn't

**EXPORTED (has ts_rs / AppEnum annotations):**
- Response DTOs in `src/portals/<portal>/responses.rs` — `#[derive(Serialize, ts_rs::TS, forge::ApiSchema)]` + `#[ts(export)]`.
- Request DTOs in `src/portals/<portal>/requests.rs` — `#[derive(Debug, Deserialize, ts_rs::TS, forge::ApiSchema)]` (+ `forge::Validate` when using derive-style validators) + `#[ts(export)]`.
- Cross-cutting shared types in `src/types/mod.rs` — e.g., `StatusResponse`, `ApiError`, `FieldError`.
- App-owned enums in `src/domain/enums/` — `#[derive(..., forge::AppEnum)]`.
- The `Permission` enum in `src/ids/permissions.rs` — same AppEnum treatment.
- Forge framework DTOs your app uses (e.g., datatable request/response shapes) — exported by Forge itself, landing in the same `generated/` folder.

**NOT EXPORTED:**
- Models in `src/domain/models/` — server-only. TS derives from DTOs; models carry `forge::Model` only.
- Services in `src/domain/services/` — internal.
- Jobs, events, listeners, channels, validation rules — backend-only.
- Helpers, trait impls, private structs — no derives → no emit.

## The annotations you use

### Response DTO (seen in `src/portals/admin/responses.rs`)

```rust
use serde::Serialize;
use ts_rs::TS;

#[derive(Serialize, TS, forge::ApiSchema)]
#[ts(export)]
pub struct AdminResponse {
    pub id: String,
    pub username: String,
    #[ts(type = "import(\"./AdminType\").AdminType")]
    pub admin_type: AdminType,
    #[ts(type = "Array<import(\"./Permission\").Permission>")]
    pub permissions: Vec<Permission>,
    pub created_at: String,
}
```

### Request DTO (seen in `src/portals/admin/requests.rs`)

```rust
#[derive(Debug, Deserialize, ts_rs::TS, forge::ApiSchema)]
#[ts(export)]
pub struct CreateAdminRequest {
    pub username: String,
    pub password: String,
    #[ts(type = "import(\"./AdminType\").AdminType")]
    pub admin_type: AdminType,
    #[ts(type = "Array<import(\"./Permission\").Permission>")]
    pub permissions: Vec<Permission>,
}
```

### App enum (seen in `src/domain/enums/admin_type.rs`)

```rust
#[derive(Clone, Copy, Debug, PartialEq, Eq, forge::AppEnum)]
pub enum AdminType {
    SuperAdmin,
    Developer,
    Admin,
}
```

With custom wire keys (seen in `src/ids/permissions.rs`):

```rust
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, forge::AppEnum)]
pub enum Permission {
    #[forge(key = "admins.read")]
    AdminsRead,
    #[forge(key = "admins.manage")]
    AdminsManage,
    // ...
}
```

### `#[ts(...)]` attribute cheat-sheet

| Attribute | Use | Example seen |
|---|---|---|
| `#[ts(export)]` | Required on every struct/enum you want emitted. | Every DTO. |
| `#[ts(type = "...")]` | Override the TS type for a field. | `Record<string, number>`, `unknown`, cross-file enum imports. |
| `#[ts(type = "import(\"./Foo\").Foo")]` | Reference an enum emitted elsewhere. | `AdminMeResponse.admin_type`. |
| `#[ts(type = "Array<import(\"./Foo\").Foo> \| null")]` | Optional array of an enum. | `UpdateAdminRequest.permissions`. |
| `#[ts(optional)]` | Emit as `field?: T` instead of `field: T \| null`. Works with `forge::TS`; rarely needed elsewhere. | `ApiError` in `src/types/mod.rs`. |
| `#[ts(rename = "foo")]` | Rename field on the TS side. Rare. | — |

`forge::TS` (as opposed to `forge::ApiSchema`) is used in `src/types/mod.rs` for shapes Forge itself owns at the error/boundary level (`ApiError`, `FieldError`). Default for app-owned DTOs is `forge::ApiSchema` — keep using that unless you're working inside that small error-surface set.

## What Forge auto-generates for AppEnum

For any enum deriving `forge::AppEnum`, `make types` emits one `.ts` file containing four exports. For example, `src/domain/enums/admin_type.rs` produces `frontend/shared/types/generated/AdminType.ts`:

```ts
// Auto-generated from AppEnum. Do not edit.

export type AdminType = "super_admin" | "developer" | "admin";

export const AdminTypeValues = ["super_admin", "developer", "admin"] as const;

export const AdminTypeOptions = [
  { value: "super_admin", labelKey: "enum.admin_type.super_admin" },
  { value: "developer", labelKey: "enum.admin_type.developer" },
  { value: "admin", labelKey: "enum.admin_type.admin" },
] as const;

export const AdminTypeMeta = {
  id: "admin_type",
  keyKind: "string",
  options: AdminTypeOptions,
} as const;
```

- `<Name>` — the union type. Use for typing fields and variables.
- `<Name>Values` — tuple of bare string keys. Use for iteration / runtime `includes` checks.
- `<Name>Options` — `{ value, labelKey }[]` for select inputs. `labelKey` follows the `enum.<snake_name>.<variant>` convention and must have matching entries in `locales/<lang>/messages.json`.
- `<Name>Meta` — metadata bundle for framework use.

The `index.ts` barrel re-exports all four named bindings for enums (vs. only `type` for regular DTOs), so you can `import { AdminTypeOptions, type AdminType } from "@shared/types/generated"` without deep paths.

## The command

```bash
make types
```

Under the hood: `PROCESS=cli cargo run -- types:export`. Reads the binary's registered schemas and rewrites `frontend/shared/types/generated/` from scratch.

- Auto-runs as a dependency of `make dev` and `make build` — you don't need to remember it in the hot loop.
- Commit the generated files. They're tracked in git and must match the Rust source on every branch.
- The command is idempotent. Re-running produces identical output until the Rust source changes.

## Common patterns

### Add a field to an existing DTO

1. Edit the Rust struct; add the field with its type.
2. `make types`.
3. Frontend picks up the new field on next compile; fix any consumer that now needs to supply / render it.

### Add a new shared enum used across DTOs

1. Create `src/domain/enums/<snake_name>.rs` with `#[derive(Clone, Copy, Debug, PartialEq, Eq, forge::AppEnum)]`. Add custom keys with `#[forge(key = "...")]` only if the default `snake_case` of the variant name isn't what you want on the wire.
2. `pub mod <snake_name>;` + `pub use <snake_name>::<Name>;` in `src/domain/enums/mod.rs`.
3. Reference from DTOs with `#[ts(type = "import(\"./<Name>\").<Name>")]` on the field.
4. Add `enum.<snake_name>.<variant>` entries to `locales/en/messages.json` and every other locale (see CLAUDE.md translation rules).
5. `make types`. Both the enum file and its `Options` / `Values` land in TS automatically.

### Override a complex type (the `serde_json::Value` trick)

When a Rust type like `BTreeMap<String, u64>` doesn't implement `forge::ApiSchema` (or ts_rs produces an unhelpful shape), wrap the field as `serde_json::Value` and override the TS type. Pattern from `BadgeCountsResponse` in `src/portals/admin/responses.rs`:

```rust
#[derive(Serialize, ts_rs::TS, forge::ApiSchema)]
#[ts(export)]
pub struct BadgeCountsResponse {
    #[ts(type = "Record<string, number>")]
    pub counts: serde_json::Value,
}
```

Serialize still produces the correct JSON; the TS declaration gets the precise shape you want. Use the same trick for `Record<string, string>` (localized maps in `CreatePageRequest`) or `unknown` (arbitrary settings values in `UpdateSettingValueRequest`).

## Gotchas

- **Integer widths matter.** `u8`, `u16`, `u32`, `i32`, `f64` → `number`. `u64`, `i64` → `bigint` (see `LogQuery.limit` → `bigint | null`). If you want `number` on the frontend, type the Rust field as `u32` or serialize as a string.
- **`Option<T>` becomes `T | null`, not `T | undefined`.** Fields are always present in the JSON; null signals absence.
- **`#[ts(optional)]` produces `field?: T`.** Only used in Forge-owned error shapes via `forge::TS`. Don't reach for it by default.
- **`chrono::DateTime`, `Uuid`, `ModelId<T>` serialize to `string`.** Date fields are ISO 8601 strings; IDs are UUID strings.
- **`BTreeMap` / `HashMap` don't round-trip cleanly through `forge::ApiSchema`.** Use the `serde_json::Value` + `#[ts(type = "Record<K, V>")]` workaround.
- **Missing `#[ts(export)]` = silent miss.** The struct gets the derive but no file appears in `frontend/shared/types/generated/`. Always pair `ts_rs::TS` with `#[ts(export)]`.
- **Models have no ts_rs derives.** `src/domain/models/` is server-only. If a frontend needs a model shape, build a DTO for it.
- **The `generated/` folder is owned by the tool.** Every `make types` run rewrites it end-to-end. Hand edits are lost.

## Frontend consumption patterns

```ts
// Typed response and request DTOs
import type { AdminResponse, CreateAdminRequest } from "@shared/types/generated";

const res = await api.post<AdminResponse>("/admins", payload as CreateAdminRequest);
```

```ts
// Enum labels in a table cell (from frontend/admin/src/pages/AdminsPage.tsx)
import { AdminTypeOptions } from "@shared/types/generated";
import { enumLabel } from "@shared/utils";
import { useTranslation } from "react-i18next";

const { t } = useTranslation();
// inside a DataTable column render:
render: (row) => enumLabel(AdminTypeOptions, row.admin_type, t)
```

```ts
// Select input options
import { CountryStatusOptions } from "@shared/types/generated";
import { enumOptions } from "@shared/utils";

<Select {...form.field("status")} options={enumOptions(CountryStatusOptions, t)} />
```

```ts
// Iteration / runtime checks
import { PermissionValues } from "@shared/types/generated";

const isValid = PermissionValues.includes(input as (typeof PermissionValues)[number]);
```

## Verify

```bash
make types
```

Command must exit 0. Then check:

```bash
ls frontend/shared/types/generated/<YourNewType>.ts
```

The new file exists, contains the expected union / struct shape, and is re-exported from `frontend/shared/types/generated/index.ts`.

## Don't

- **Don't add `ts_rs::TS` to models** in `src/domain/models/`. Models are internal; the frontend gets DTOs.
- **Don't hand-edit files in `frontend/shared/types/generated/`.** They regenerate on every `make types`.
- **Don't duplicate an app-owned enum in both Rust and TypeScript.** `forge::AppEnum` is the single source of truth — one definition, the generator handles the rest.
- **Don't use string literals on the frontend where a generated const exists.** For permissions, use `PermissionValues` / `PermissionOptions`, never the raw `"admins.manage"` string. For enum variants, use `<Enum>Values` or the typed `type` union.
- **Don't forget `#[ts(export)]`.** Without it, the derive compiles but no file lands.
- **Don't ship a Rust type that doesn't round-trip through `serde`.** ts_rs introspection and `forge::ApiSchema` both rely on the same serde shape.
- **Don't commit without re-running `make types`.** Stale generated files are a merge-conflict magnet and a source of runtime drift.
- **Don't install a new ts-rs or schema crate.** The derives you have are sufficient; ask before adding deps (CLAUDE.md rule).

## When this skill doesn't fit

- **Writing a new DTO as part of a full feature** — the feature's own skill (`admin-datatable`, `new-portal`, etc.) covers the whole shape. Use this skill only when the pipeline itself is the question.
- **A frontend consumer is miscompiling** — regular frontend work. Check the generated file, then read the consuming component.
- **`tsconfig.json`, Biome, or Vite config change** — separate concern; ask rather than edit.
- **Adding a new permission** — use `new-permission`; this skill only covers how it surfaces in TS.
- **Adding a model** — use `new-model`; models are never exported as TS.
