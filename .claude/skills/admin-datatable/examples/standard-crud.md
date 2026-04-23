# Example: Standard CRUD — `<Resource>FormModal` template

Read this when the `admin-datatable` skill's decision guide selects "Standard CRUD" and step 13 needs the form-modal shape.

## Source of truth

The base form-modal template — `useForm` setup, load-on-mount for edit mode, create-vs-edit branching, Save/Cancel/Delete button row, 422 auto-wiring — lives in **`.claude/skills/frontend-form/SKILL.md`** under Variant A ("Modal form — canonical form shape"). That variant IS the admin-CRUD form modal.

**Read that first.** Copy its template, then layer the CRUD-specific notes below.

## CRUD-specific notes (delta from the base template)

The base `frontend-form` Variant A already covers the full shape. The additions that are specific to admin-datatable's CRUD flow are:

1. **File path and naming**:
   - Form modal: `frontend/admin/src/components/<Resource>FormModal.tsx`
   - Delete confirmation modal: `frontend/admin/src/components/Confirm<Resource>DeleteModal.tsx`

2. **Invocation from the list page** — launched from the page's row-action column and the page-header "New" button:
   ```tsx
   // Create
   modal.open(
     <Resource>FormModal,
     { onSaved: () => tableRefresh.current?.() },
     { title: t("Create <Resource>") },
   );

   // Edit — pre-loads the record via the base template's useEffect
   modal.open(
     <Resource>FormModal,
     { <resource>Id: row.id, onSaved: () => tableRefresh.current?.() },
     { title: t("Edit <Resource>") },
   );
   ```

3. **`onSaved` calls `tableRefresh.current?.()`** — the admin-datatable list page holds a `useRef<(() => void) | null>(null)` tableRefresh, passed as `refreshRef` to `<DataTable>`. After successful save or delete, calling this re-fetches the list. This wiring is specific to datatable-backed CRUD; standalone forms don't need it.

4. **`<display_field>`** in the delete confirmation — pick whatever makes a human-readable identity for the resource (`loaded.name`, `loaded.username`, `loaded.title`). It's interpolated into the native-key confirm string `t("Delete {{name}}? This action cannot be undone.", { name: loaded.<display_field> })`.

5. **View-only mode** (optional) — if some admins can view but not edit records, extend the base template with a `mode: "edit" | "view"` derived from a per-target permission helper (see `frontend/admin/src/adminAccess.ts` for `adminFormModeForTarget`). Disable every `<Input>` / `<Select>` in view mode, hide the Delete button, and replace Save with Close. The real-world pattern lives in `frontend/admin/src/components/AdminFormModal.tsx` — consult it if you hit view-mode requirements.

6. **Permissions on the modal** — gate the Delete button with the resource's manage permission (`usePermission("<resource>.manage")`). The Save button is always visible to anyone who can open the modal; the backend's `.permissions([Permission::<Resource>Manage])` on the update route is the authoritative check.

7. **i18n keys** — mirror the convention set by `admin-datatable` step 7:
   - `admin.<resource>s.create_title` / `edit_title` / `view_title`
   - `admin.<resource>s.created` / `updated` / `deleted` (toast success messages)
   - `admin.<resource>s.confirm_delete` — parameterized with `{{name}}`
   - Column labels `admin.<resource>s.columns.*` as needed

## Delete confirmation modal

The delete confirmation is `frontend-form` Variant C ("Confirm action modal"). File path in the CRUD flow:

`frontend/admin/src/components/Confirm<Resource>DeleteModal.tsx`

Copy Variant C verbatim — the shape is identical for any delete confirmation across the admin portal. Only the i18n keys and optional prop names differ (typically `name: string` + `onConfirm: () => Promise<void>`).

## When your CRUD needs more than the base shape

- **Many fields / complex layout** → use `<FormBuilder>` from `@shared/components` per `frontend-form`'s FormBuilder note.
- **Wizard-style multi-step create** → `frontend-form` Variant D. Rare for standard CRUD.
- **File upload field** → `<FileUpload>` — axios handles multipart automatically. Included in `shared-components`.
- **Conditional fields (show/hide based on other fields)** → still fits within Variant A; put conditionals inside the `<ModalBody>` JSX, e.g. `{values.type === "premium" && <Input ... />}`.
- **Custom validation beyond 422 auto-wiring** → extend the `useForm` `validate` callback per `frontend-form`. Rare.

## When this example doesn't fit

If you're NOT inside a CRUD datatable flow, don't use this example — go straight to `frontend-form`. This file only exists to document the CRUD-specific wrapping around `frontend-form`'s Variant A (table refresh hook, view-mode branching, permission-aware delete button). Nothing else.
