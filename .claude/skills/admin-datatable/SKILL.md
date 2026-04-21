---
name: admin-datatable
description: Use when adding a new admin-portal listing / CRUD page backed by a datatable. Typical phrasings: "add a users page", "add admin for top-ups with filters and search", "create a CRUD page for withdrawals", "list page with export and create modal for X". Covers the full cross-layer flow — backend Datatable trait + registration + CRUD routes + request/response DTOs + service functions + frontend list page + form modal + delete modal + router + menu + i18n. Do NOT use for: single-record detail pages (separate skill), wizard-style multi-step forms, user-portal listing pages (admin-portal only for v1), or public-facing datatables.
---

# Admin Datatable — add a new admin listing / CRUD page

## When to invoke

A user asks for an admin page showing a list of rows with filters, sorting, pagination, and typically create/edit/delete. Typical phrasings:

- "add a users page with search and edit modal"
- "admin CRUD for top-ups"
- "new admin page to manage withdrawals"
- "list page with filters for audit log" (read-only variant)
- "pending KYC review page with approve/reject per row" (approval-workflow variant)

Do NOT invoke for:
- **Single-record detail page** (e.g., `/admin/users/:id`) — that's a different pattern; escalate if no detail-page skill exists yet.
- **Wizard / multi-step form** — needs a different page shape than a datatable.
- **User-portal listings** — admin-portal only in v1. Copy the skill and adapt if user-portal needs arise.
- **Public/unauthenticated datatables** — authorization path differs.
- **Adding a single filter or column to an existing datatable** — just edit the existing datatable file; no skill needed for a one-line change.

## Concept

Admin datatables in this starter are defined backend-side as `impl forge::Datatable` structs that declare a source query (direct `ModelQuery<M>` or a `ProjectionQuery` with joins), columns, filters, default sort, and row-level scope filters. They're registered globally and served via a single generic endpoint: `GET /admin/datatables/{id}/query` (and `/download` for CSV export). CRUD mutations go through dedicated REST routes under the resource's own scope (e.g., `/admin/admins`).

Frontend renders with `<DataTable>` from `@shared/components`, pointing at the generic query URL with the datatable's ID. Create/edit/delete are modal-based: click a row action → `modal.open(FormModal, { id, onSaved })` → service call → `toast` + refresh.

**Deeper references** (read only if the procedure below is unclear):
- Existing datatables: `src/portals/admin/datatables/admin_datatable.rs` (simplest), `user_datatable.rs` (projection with joins)
- Generic query endpoint: `src/portals/admin/datatable_routes.rs`
- Example list page: `frontend/admin/src/pages/AdminsPage.tsx`
- Example form modal: `frontend/admin/src/components/AdminFormModal.tsx`

## Prerequisites

Before writing any code, verify each of these exists. If any is missing, stop and create it first — don't paper over gaps:

- [ ] **The source model** exists in `src/domain/models/` with `#[derive(forge::Model)]`. Migration applied.
- [ ] **The permission(s) gating view/manage** exist in `src/ids/permissions.rs`. If new permissions are needed (e.g., `TopupsRead`, `TopupsManage`), add them first and run `make types`.
- [ ] **Enum variants for any status-like fields** exist in `src/domain/enums/` with `#[derive(forge::AppEnum)]`. String-based status columns must not be introduced.
- [ ] **The menu group** (parent under which this page will live) exists in `frontend/admin/src/config/side-menu.ts`. If not, decide the parent now.

## Decisions — answer ALL before writing code

Walk the user through every question. If any answer is unclear or indicates a non-standard variant, stop and ask. Do NOT generate code on guess.

1. **Source shape** — is the datatable backed by:
   - **Direct model** — one model, no joins (like `AdminDatatable`). Simplest.
   - **Projection with joins** — needs one or more joined tables for display-only columns (like `UserDatatable` with `introducer_label`). Use when a column's value comes from another table.

2. **Shape variant** — which of:
   - **Read-only list** — list + filter + pagination + optional CSV export. No create / update / delete. (Audit log, history tables.)
   - **Standard CRUD** — list + create modal + edit modal + delete confirmation. 80% case.
   - **Approval workflow** — list with per-row action buttons (approve, reject, custom) that hit dedicated endpoints. No create/edit modals. (Pending withdrawals, pending KYC.)
   - **Mixed** — standard CRUD plus per-row custom actions. Combine the above.

3. **Columns** — enumerate every column:
   - Which model fields map 1:1 to a column (e.g., `Admin::USERNAME`)?
   - Any **computed columns** via `.mappings()` (function-based, post-query — e.g., `permission_count`)?
   - Any **joined/projected columns** via `ProjectionQuery::select_field` (requires source-shape = "projection with joins")?
   - Which columns are `.sortable()` / `.filterable()` / `.exportable()`?
   - Any columns with **custom cell renderers** on the frontend (buttons, formatted values, links)?

4. **Filters** — which filter controls in the UI? Each is declared inline in `available_filters()`:
   - `text_like(field, label)` — substring match on one column.
   - `text_search_fields(key, label, [Field1, Field2, ...])` — OR across multiple columns (free-text search).
   - `select(field, label).options(Enum::options())` — dropdown bound to an `AppEnum`.
   - Date range / other — escalate to `references/custom-filter.md` if non-default.

5. **Default sort** — which column and direction? Typically `created_at DESC`.

6. **Permissions** — typically two: `<Resource>Read` (view list + detail) and `<Resource>Manage` (create/update/delete). Fine-grained exceptions (e.g., per-column gating) live in `references/permission-gated-column.md`.

7. **Row actions** — what can the user do per row? Options:
   - Edit via modal (opens form modal pre-filled).
   - View-only modal (same modal, read-only mode — existing pattern uses `adminFormModeForTarget`).
   - Custom action buttons (approve/reject/retry) — each hits its own endpoint.
   - Navigate to detail page (requires `admin-detail-page` skill — escalate if missing).

8. **Page placement + path** — which menu group does it belong under, and what's the URL path (`/admin/<resource>`)?

9. **Export enabled?** — if yes, requires `exports.read` permission on top of the list-read permission. Adds a download button.

10. **i18n namespace** — `admin.<resource>.*` per convention. Keys needed: title, subtitle, column labels (if not reusing generic), modal titles (create/edit/view), action labels, success toasts, delete confirmation text.

Present these to the user. Confirm all answers. THEN proceed to Steps.

## Core steps — always run

### 1. Create the datatable definition

Path: `src/portals/admin/datatables/<resource>_datatable.rs`

**Direct-model template** (use when source-shape = "direct model"):

```rust
use async_trait::async_trait;
use forge::prelude::*;

use crate::domain::enums::<YourEnum>;      // if any column is enum-typed
use crate::domain::models::<YourModel>;

pub struct <YourModel>Datatable;

#[async_trait]
impl Datatable for <YourModel>Datatable {
    type Row = <YourModel>;
    type Query = ModelQuery<<YourModel>>;
    const ID: &'static str = "admin.<resource>";

    fn query(_ctx: &DatatableContext) -> Self::Query {
        <YourModel>::model_query()
    }

    fn columns() -> Vec<DatatableColumn<Self::Row>> {
        vec![
            DatatableColumn::field(<YourModel>::<FIELD_1>)
                .label("<i18n.key.or.literal>")
                .sortable()
                .filterable()
                .exportable(),
            // ... one per user-visible column
            DatatableColumn::field(<YourModel>::CREATED_AT)
                .label("Created")
                .sortable()
                .filterable()
                .exportable(),
        ]
    }

    // Computed columns (optional — only if you declared any in Decision 3).
    fn mappings() -> Vec<DatatableMapping<Self::Row>> {
        vec![
            // DatatableMapping::new("computed_key", |row: &<YourModel>, _ctx| {
            //     DatatableValue::number(<computation>)
            // }),
        ]
    }

    fn default_sort() -> Vec<DatatableSort<Self::Row>> {
        vec![DatatableSort::desc(<YourModel>::CREATED_AT)]
    }

    async fn available_filters(_ctx: &DatatableContext) -> Result<Vec<DatatableFilterRow>> {
        Ok(vec![
            DatatableFilterRow::pair(
                DatatableFilterField::text_search_fields(
                    "search",
                    "admin.datatable.filters.search",
                    [<YourModel>::<FIELD_1>, <YourModel>::<FIELD_2>],
                )
                .placeholder("admin.<resource>.search_placeholder"),
                DatatableFilterField::select(
                    "<status_field>",
                    "admin.datatable.filters.<status_field>",
                )
                .options(<YourEnum>::options()),
            ),
        ])
    }

    // Row-level visibility scoping (optional — only if rows should be scoped
    // per admin; most models don't need this). Example: tenancy, ownership.
    // async fn filters(ctx: &DatatableContext, query: Self::Query) -> Result<Self::Query> {
    //     Ok(query.where_eq(<YourModel>::<SCOPE_COL>, ctx.actor.resolve::<Admin>(ctx.app).await?.id))
    // }
}
```

**Projection-with-joins template**: if source-shape = "projection with joins", use a `#[derive(forge::Projection)]` row struct and `ProjectionQuery`. Read `./references/projection-with-joins.md` for the full template before proceeding.

**Strongly-typed rules:**
- Use macro-generated column constants: `<YourModel>::<FIELD>`. Never `.field("status")` with a string.
- Select options bound to enums: `<YourEnum>::options()`. Never `vec![("pending", "Pending"), ...]`.
- Labels can be i18n keys (`"admin.<resource>.columns.name"`) or literals (`"Username"`); match the existing idiom in neighboring datatables.

### 2. Register the datatable

Edit `src/portals/admin/datatables/mod.rs`. Three places:

**a. Module declaration + export** at the top:

```rust
mod <resource>_datatable;
pub use <resource>_datatable::<YourModel>Datatable;
```

**b. In `register_all`** — add one line:

```rust
pub fn register_all(registrar: &mut ServiceRegistrar) -> Result<()> {
    // ... existing registrations
    registrar.register_datatable::<<YourModel>Datatable>()?;
    Ok(())
}
```

**c. In `run_json` (and `run_download` if exportable)** — add a match arm:

```rust
pub async fn run_json(
    id: &str,
    app: &AppContext,
    actor: Option<&Actor>,
    request: DatatableRequest,
    locale: Option<&str>,
    timezone: Timezone,
) -> Option<Result<DatatableJsonResponse>> {
    Some(match id {
        // ... existing arms
        <YourModel>Datatable::ID => runner::build_json_response::<<YourModel>Datatable>(
            app, actor, request, locale, timezone,
        ).await,
        _ => return None,
    })
}
```

Same shape in `run_download` for CSV export.

### 3. Add permission mapping for the generic datatable endpoint

Edit `src/portals/admin/datatable_routes.rs`. Add to the `minimum_read_permission` function:

```rust
fn minimum_read_permission(id: &str) -> Option<Permission> {
    match id {
        // ... existing
        "admin.<resource>" => Some(Permission::<Resource>Read),
        _ => None,
    }
}
```

Without this, the generic `/admin/datatables/<id>/query` endpoint won't enforce the right permission for this datatable.

### 4. Create the frontend list page

Path: `frontend/admin/src/pages/<Resource>sPage.tsx`

Standard-CRUD template (adapt for other shapes — see "Extensions" below):

```tsx
import { Button, DataTable } from "@shared/components";
import { modal } from "@shared/modal";
import type { DataTableColumn } from "@shared/types/form";
import type { Permission } from "@shared/types/generated";
import { Pencil, Plus } from "lucide-react";
import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/api";
import { auth } from "@/auth";
import { <Resource>FormModal } from "@/components/<Resource>FormModal";
import { hasAllPermissions, usePermission } from "@/hooks/usePermission";

const READ: Permission = "<resource>.read";
const MANAGE: Permission = "<resource>.manage";
const EXPORTS_READ: Permission = "exports.read";

interface <Resource>Row {
  id: string;
  // ... columns the datatable returns (shape matches backend Row/Projection)
  created_at: string;
}

export function <Resource>sPage() {
  const { t } = useTranslation();
  const { user } = auth.useAuth();
  const tableRefresh = useRef<(() => void) | null>(null);
  const canManage = usePermission(MANAGE);
  const canExport = hasAllPermissions(user?.abilities, [READ, EXPORTS_READ], user?.admin_type);

  const openCreateModal = useCallback(() => {
    modal.open(
      <Resource>FormModal,
      { onSaved: () => tableRefresh.current?.() },
      { title: t("admin.<resource>s.create_title") },
    );
  }, [t]);

  const openEditModal = useCallback(
    (row: <Resource>Row) => {
      modal.open(
        <Resource>FormModal,
        { <resource>Id: row.id, onSaved: () => tableRefresh.current?.() },
        { title: t(canManage ? "admin.<resource>s.edit_title" : "admin.<resource>s.view_title") },
      );
    },
    [t, canManage],
  );

  const columns: DataTableColumn<<Resource>Row>[] = [
    {
      key: "__actions",
      label: "",
      render: (row) => (
        <Button
          type="button"
          unstyled
          className="sf-datatable-action"
          onClick={() => openEditModal(row)}
        >
          <Pencil size={16} />
        </Button>
      ),
    },
    // ... one entry per column. Use `sortable: true` where backend declared .sortable().
    // Use `render: (row) => ...` for custom cells (buttons, badges, enum labels).
    { key: "created_at", label: t("Created"), sortable: true, format: "datetime" },
  ];

  return (
    <div>
      <div className="sf-page-header">
        <div>
          <h1 className="sf-page-title">{t("admin.<resource>s.title")}</h1>
          <p className="sf-page-subtitle">{t("admin.<resource>s.subtitle")}</p>
        </div>
        {canManage && (
          <Button type="button" size="sm" prefix={<Plus size={16} />} onClick={openCreateModal}>
            {t("admin.<resource>s.new")}
          </Button>
        )}
      </div>

      <div className="mt-4">
        <DataTable<<Resource>Row>
          api={api}
          url="/datatables/admin.<resource>/query"
          downloadUrl={canExport ? "/datatables/admin.<resource>/download" : undefined}
          columns={columns}
          defaultPerPage={20}
          refreshRef={tableRefresh}
        />
      </div>
    </div>
  );
}
```

### 5. Register the route

Edit `frontend/admin/src/router.tsx`:

```tsx
{ path: "<resource>s", element: <<Resource>sPage /> },
```

### 6. Add the menu entry

Edit `frontend/admin/src/config/side-menu.ts`. Add to the appropriate parent group:

```ts
{
  key: "<group>.<resource>s",
  label: "admin.<resource>s.title",  // i18n key
  path: "/<resource>s",
  permission: "<resource>.read",
  // badge: "work.pending_<resource>s",  // only if there's a matching AdminBadge
},
```

### 7. Add i18n keys

Edit `locales/en/admin.json` (or `messages.json` if that's where admin keys live — check neighboring datatables first). Add:

```json
{
  "admin": {
    "<resource>s": {
      "title": "<Human label, plural>",
      "subtitle": "<one-line page purpose>",
      "new": "New <singular>",
      "create_title": "Create <singular>",
      "edit_title": "Edit <singular>",
      "view_title": "View <singular>",
      "created": "<singular> created",
      "updated": "<singular> updated",
      "deleted": "<singular> deleted",
      "confirm_delete": "Delete <singular> \"{{name}}\"?"
    }
  }
}
```

Duplicate the same keys in `locales/zh/admin.json` with Chinese translations. Per CLAUDE.md translation rules, every non-English locale MUST have every key.

## Extensions — standard CRUD (if applicable)

Run these only if the decision guide chose "Standard CRUD" or "Mixed".

### 8. Create the CRUD routes module

Path: `src/portals/admin/<resource>_routes.rs`

```rust
use axum::extract::{Path, State};
use forge::prelude::*;

use crate::domain::models::{<Resource>, Admin};
use crate::domain::services::<resource>_service;
use crate::portals::admin::requests::{Create<Resource>Request, Update<Resource>Request};
use crate::portals::admin::responses::<Resource>Response;

pub async fn store(
    State(app): State<AppContext>,
    i18n: I18n,
    AuthenticatedModel(actor): Auth<Admin>,
    JsonValidated(req): JsonValidated<Create<Resource>Request>,
) -> Result<impl IntoResponse> {
    let row = <resource>_service::create(&app, &i18n, &actor, &req).await?;
    Ok((StatusCode::CREATED, Json(<Resource>Response::from(&row))))
}

pub async fn show(
    State(app): State<AppContext>,
    i18n: I18n,
    AuthenticatedModel(_): Auth<Admin>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    let row = <resource>_service::find_by_id(&app, &i18n, &id).await?;
    Ok(Json(<Resource>Response::from(&row)))
}

pub async fn update(
    State(app): State<AppContext>,
    i18n: I18n,
    AuthenticatedModel(actor): Auth<Admin>,
    Path(id): Path<String>,
    JsonValidated(req): JsonValidated<Update<Resource>Request>,
) -> Result<impl IntoResponse> {
    let row = <resource>_service::update(&app, &i18n, &actor, &id, &req).await?;
    Ok(Json(<Resource>Response::from(&row)))
}

pub async fn destroy(
    State(app): State<AppContext>,
    i18n: I18n,
    AuthenticatedModel(actor): Auth<Admin>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    <resource>_service::delete(&app, &i18n, &actor, &id).await?;
    Ok(Json(MessageResponse::ok(t!(i18n, "admin.<resource>s.deleted"))))
}
```

### 9. Register the CRUD scope

Edit `src/portals/admin/mod.rs`. Add:

```rust
pub mod <resource>_routes;
```

Inside the admin scope, add a new scope:

```rust
admin.scope("/<resource>s", |scope| {
    scope
        .name_prefix("<resource>s")
        .tag("admin:<resource>s")
        .guard(Guard::Admin)
        .permission(Permission::<Resource>Read);

    scope.post("", "store", <resource>_routes::store, |route| {
        route.permissions([Permission::<Resource>Manage]);
        route.summary("Create <resource>");
        route.request::<Create<Resource>Request>();
        route.response::<<Resource>Response>(201);
    });

    scope.get("/{id}", "show", <resource>_routes::show, |route| {
        route.summary("Get <resource> by id");
        route.response::<<Resource>Response>(200);
    });

    scope.put("/{id}", "update", <resource>_routes::update, |route| {
        route.permissions([Permission::<Resource>Manage]);
        route.summary("Update <resource>");
        route.request::<Update<Resource>Request>();
        route.response::<<Resource>Response>(200);
    });

    scope.delete("/{id}", "destroy", <resource>_routes::destroy, |route| {
        route.permissions([Permission::<Resource>Manage]);
        route.summary("Delete <resource>");
        route.response::<MessageResponse>(200);
    });

    Ok(())
})?;
```

### 10. Add request DTOs

Edit `src/portals/admin/requests.rs`. Add:

```rust
#[derive(Debug, Deserialize, ts_rs::TS, forge::ApiSchema)]
#[ts(export)]
pub struct Create<Resource>Request {
    pub <field_1>: String,
    pub <field_2>: <Type>,
    // ...
}

#[async_trait]
impl RequestValidator for Create<Resource>Request {
    async fn validate(&self, validator: &mut Validator) -> Result<()> {
        validator.field("<field_1>", &self.<field_1>)
            .bail()
            .required()
            .min(1)
            .max(255)
            .apply()
            .await?;
        // ... one .field(...) block per field
        Ok(())
    }
}

#[derive(Debug, Deserialize, ts_rs::TS, forge::ApiSchema)]
#[ts(export)]
pub struct Update<Resource>Request {
    pub <field_1>: Option<String>,
    pub <field_2>: Option<<Type>>,
    // ...
}

#[async_trait]
impl RequestValidator for Update<Resource>Request {
    async fn validate(&self, validator: &mut Validator) -> Result<()> {
        if let Some(<field_1>) = self.<field_1>.as_deref() {
            validator.field("<field_1>", <field_1>)
                .bail().min(1).max(255)
                .apply().await?;
        }
        // ...
        Ok(())
    }
}
```

### 11. Add response DTO

Edit `src/portals/admin/responses.rs`. Add:

```rust
#[derive(Serialize, TS, forge::ApiSchema)]
#[ts(export)]
pub struct <Resource>Response {
    pub id: String,
    pub <field_1>: String,
    // ... mirror the user-visible fields of the model
    pub created_at: String,
    pub updated_at: String,
}

impl From<&<Resource>> for <Resource>Response {
    fn from(row: &<Resource>) -> Self {
        Self {
            id: row.id.to_string(),
            <field_1>: row.<field_1>.clone(),
            // ...
            created_at: row.created_at.to_string(),
            updated_at: row.updated_at.to_string(),
        }
    }
}
```

### 12. Create the service module

Path: `src/domain/services/<resource>_service.rs`

```rust
use forge::prelude::*;

use crate::domain::models::{<Resource>, Admin};
use crate::portals::admin::requests::{Create<Resource>Request, Update<Resource>Request};

pub async fn find_by_id(app: &AppContext, i18n: &I18n, id: &str) -> Result<<Resource>> {
    let db = app.database()?;
    <Resource>::model_query()
        .where_eq(<Resource>::ID, id)
        .first(&*db)
        .await?
        .ok_or_else(|| Error::http(404, t!(i18n, "error.not_found")))
}

pub async fn create(
    app: &AppContext,
    _i18n: &I18n,
    _actor: &Admin,
    req: &Create<Resource>Request,
) -> Result<<Resource>> {
    let transaction = app.begin_transaction().await?;

    let created = <Resource>::model_create()
        .set(<Resource>::<FIELD_1>, req.<field_1>.as_str())
        // ... .set(...) for each field
        .save(&transaction)
        .await?;

    transaction.commit().await?;
    Ok(created)
}

pub async fn update(
    app: &AppContext,
    i18n: &I18n,
    _actor: &Admin,
    id: &str,
    req: &Update<Resource>Request,
) -> Result<<Resource>> {
    let target = find_by_id(app, i18n, id).await?;

    let transaction = app.begin_transaction().await?;
    let mut update = target.update();

    if let Some(<field_1>) = req.<field_1>.as_deref() {
        update = update.set(<Resource>::<FIELD_1>, <field_1>);
    }
    // ... one block per updatable field

    let updated = update.save(&transaction).await?;
    transaction.commit().await?;
    Ok(updated)
}

pub async fn delete(
    app: &AppContext,
    i18n: &I18n,
    _actor: &Admin,
    id: &str,
) -> Result<()> {
    let target = find_by_id(app, i18n, id).await?;

    let transaction = app.begin_transaction().await?;
    target.delete().execute(&transaction).await?;
    transaction.commit().await?;
    Ok(())
}
```

Add `pub mod <resource>_service;` to `src/domain/services/mod.rs`.

If the resource needs authorization checks (e.g., "only super-admin can create", "admin can't delete themselves"), add `ensure_*` helper functions at the bottom of the service module and call them at the top of each mutation. See `admin_service::create` for the pattern.

### 13. Create the form modal

Path: `frontend/admin/src/components/<Resource>FormModal.tsx`

Read `./examples/standard-crud.md` for the complete form modal template. It has the loading-existing-on-mount pattern, the create-vs-edit mode branching, and the in-modal delete button with confirmation sub-modal. That file is the canonical reference.

### 14. Create the delete confirmation modal

Path: `frontend/admin/src/components/Confirm<Resource>DeleteModal.tsx`

```tsx
import { Button } from "@shared/components";
import { ModalBody, ModalFooter } from "@shared/modal";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface Confirm<Resource>DeleteModalProps {
  name: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export function Confirm<Resource>DeleteModal({
  name,
  onConfirm,
  onClose,
}: Confirm<Resource>DeleteModalProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ModalBody>
        <p>{t("admin.<resource>s.confirm_delete", { name })}</p>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
          {t("Cancel")}
        </Button>
        <Button variant="danger" size="sm" busy={busy} onClick={handleConfirm}>
          {t("Delete")}
        </Button>
      </ModalFooter>
    </>
  );
}
```

## Extensions — non-CRUD variants

### If shape = "Read-only list"

Skip steps 8–14. Stop after step 7. The page has no create button, no form modal, no delete.

Adjust step 4's template: remove `canManage`, `openCreateModal`, `openEditModal`, and the `__actions` column. The page is pure list + filter + pagination.

### If shape = "Approval workflow"

Skip the form modal (step 13). Keep:
- Steps 1–7 (datatable + page + router + menu + i18n).
- A custom `__actions` column on the frontend with approve / reject / custom buttons (see step 4 render pattern).
- Dedicated endpoints per action (e.g., `POST /admin/<resource>s/{id}/approve`), registered in step 9's scope, backed by service functions per action.
- Delete modal only if applicable.

Example approval-workflow layout: read `./examples/approval-workflow.md`.

### If a column needs a custom cell renderer (button, badge, formatted value)

Use the `render` prop on the frontend column definition (step 4). No backend change required — backend returns the raw value; frontend decides presentation:

```tsx
{
  key: "status",
  label: t("Status"),
  sortable: true,
  render: (row) => enumLabel(<YourEnum>Options, row.status, t),
},
{
  key: "amount",
  label: t("Amount"),
  sortable: true,
  render: (row) => <span className="font-mono">{row.amount}</span>,
},
```

### If a column is computed (not a model field)

Use `.mappings()` on the Datatable impl (step 1 template has a commented example). The mapping function receives the row and returns a `DatatableValue`. Computed columns are NOT sortable or filterable at the DB level — they're applied post-query per row.

Example from `admin_datatable.rs`:
```rust
fn mappings() -> Vec<DatatableMapping<Self::Row>> {
    vec![
        DatatableMapping::new("permission_count", |admin: &Admin, _ctx| {
            DatatableValue::number(admin_service::permission_module_count(admin) as u64)
        }),
    ]
}
```

### If a column is joined from another table

Use a `#[derive(forge::Projection)]` row struct + `ProjectionQuery` with `.left_join(...)` + `.select_field(...)`. Read `./references/projection-with-joins.md` for the full pattern.

### If a filter needs a non-default control (date range, relation picker, custom)

Read `./references/custom-filter.md`.

### If the page needs bulk actions (multi-select + bulk endpoint)

Not present in the starter today. Read `./references/bulk-actions.md` if and when the reference is added; otherwise escalate.

### If a column must be visible only to admins with a specific permission

Read `./references/permission-gated-column.md` if present; otherwise escalate.

## Verify

Run in order, expect each to be clean:

```bash
make check     # cargo check
make types     # regenerate TypeScript bindings from Rust DTOs
make lint      # cargo clippy -D warnings + Biome
```

If any of these fails on the new files, fix at the source. Do not add `#[allow(...)]` or `biome-ignore` comments unless you have a specific reason and record it.

**End-to-end smoke** (requires Postgres + Redis):

```bash
make dev
```

Log in as developer admin, navigate to the new page via the menu, verify:
1. The list loads.
2. Pagination works (change per-page).
3. Each declared filter applies correctly.
4. Each sortable column sorts.
5. Create modal opens, submits, shows a toast, refreshes the list.
6. Edit modal loads existing data, submits, toast, refresh.
7. Delete confirmation opens, deletes, toast, refresh.
8. Permission gates work — log in as an admin without `<resource>.manage` and confirm the create button + edit/delete affordances are hidden.

## Don't

- **Don't skip the decision guide.** The "answer all before writing code" discipline prevents the 400-line misfire.
- **Don't use stringly-typed columns or values.** `<YourModel>::<FIELD>` + `<YourEnum>::<Variant>`, never raw strings. The derive macros exist for this.
- **Don't duplicate the datatable query logic on a frontend hook.** Backend is the single source of truth for rows, filters, sort, and permission scoping.
- **Don't create CRUD routes for a read-only variant.** If the decision guide chose read-only, steps 8–14 don't exist for this page.
- **Don't manually construct `DatatableRequest` on the frontend.** `<DataTable>` handles query param assembly from the column config; just pass `url` + `columns` + `refreshRef`.
- **Don't bypass the generic `/datatables/<id>/query` endpoint.** Custom list endpoints miss the framework's filter parsing, sort handling, and permission check.
- **Don't skip `make types` after adding request/response DTOs.** Frontend will `any`-type the fields without regeneration.
- **Don't forget `locales/zh/*` (or any non-English locale).** CLAUDE.md rule: every non-English locale file must have every key.
- **Don't install new dependencies without asking.** Datatable + modal + form + i18n infra is already in place.

## When this skill doesn't fit

If the user's request doesn't match a datatable shape, route appropriately:

- **"Add a single-record detail page"** (e.g., `/admin/users/:id` with full editable form, not a modal) → no skill yet; escalate, or adapt this skill if the detail page embeds a datatable of related records.
- **"Add a wizard / multi-step form"** → no skill yet; escalate.
- **"Add a dashboard tile / KPI widget"** → different component, not a datatable.
- **"Add a tree / hierarchical view"** → not a datatable; escalate.
- **"Add a user-portal listing"** → this skill is admin-portal-specific in v1; copy + adapt the skill for user portal when needed.
- **"Modify an existing datatable's columns or filters"** → just edit the existing datatable file directly; no skill needed for a delta edit.
- **"Add a permission to gate the whole page"** → add the permission first (future `new-permission` skill), then use this skill for the page itself.
- **"Expose a WebSocket feed of table changes"** → separate concern; combine this skill (for the list) with `admin-badge` (for counts) or a future realtime-feed skill.
