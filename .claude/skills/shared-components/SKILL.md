---
name: shared-components
description: Use when a developer is picking, composing, or questioning frontend primitives — the `@shared/components`, `@shared/hooks`, `@shared/modal`, `@shared/store`, `@shared/auth`, `@shared/api`, `@shared/websocket`, `@shared/config`, and `@shared/i18n` library surface. Typical phrasings: "which component should I use for X", "is there a shared button / input / select", "can I use a raw `<input>`", "how do I open a modal", "what's in @shared/components", "how do I compose a form", "add a Select with async search", "how does `useForm` wire errors". Authoritative catalog of every shared primitive + anti-raw-HTML discipline + theming rules. Do NOT use for: adding a brand-new shared primitive to `@shared/components` (rare; see `references/` when that first arises); writing frontend business logic (that's a page / feature skill); backend Rust work; understanding TS generation (`typescript` skill).
---

# Shared Components — the frontend primitive catalog

## When to invoke

A developer is about to compose a React component, add a form field, open a modal, or wire state — and needs to pick the right shared primitive. Typical phrasings:

- "which component should I use for a money input"
- "is there a shared date picker"
- "how do I open a modal from a button click"
- "can I use a raw `<button>`"
- "what's in `@shared/components`"
- "how does `useForm` handle 422 errors"
- "how do I add a Select with async options"
- "shared primitive for file upload"

Do NOT invoke for:
- **Adding a NEW primitive to `@shared/components`** — rare, out of scope here. Document the first real case in `references/adding-a-primitive.md` when it happens.
- **Frontend business logic / page composition** — that's `admin-page`, `admin-datatable`, `frontend-form`, or `admin-badge` depending on context.
- **Backend Rust work** — different subsystem entirely.
- **TypeScript type generation** — `typescript` skill.

## Concept

Every user-facing control in the portals is a shared primitive imported from `@shared/components` (or its sibling packages `@shared/hooks`, `@shared/modal`, etc.). Raw native HTML — `<button>`, `<input>`, `<select>`, `<textarea>`, `<form>`-as-event-target — is **banned in feature / page / module code**. Only `frontend/shared/` infrastructure internals are permitted to touch native controls, and even there, sparingly. Breaking this rule introduces visual inconsistency, loses theming, breaks keyboard / a11y baseline, and bypasses the form-error interceptor wiring.

The library is organized around four axes:

1. **Controls** — `@shared/components` — Input, Select, CountrySelect, ContactInput, Checkbox, Radio, FileUpload, DatePicker, TimePicker, DateTimePicker, Button, Lightbox, DataTable, FormBuilder, FormField.
2. **State** — `@shared/hooks` (useForm, useDebounce, useInfiniteScroll, useCountryOptions), `@shared/store` (createStore, useStore), `@shared/i18n` (localeStore, useLocale), `@shared/config` (runtimeStore, useRuntimeStore).
3. **Infrastructure factories** — `@shared/api` (createApi), `@shared/auth` (createAuth), `@shared/websocket` (createWebSocket), `@shared/config` (getConfig, runtimeStore).
4. **Modals** — `@shared/modal` (modal.open, modal.close, ModalProvider, ModalBody, ModalFooter).

Imports are always via path alias: `@shared/*` for shared, `@/` for portal-local. Never relative (`../../`) — CLAUDE.md frontend rule #8.

## Controls — when to use each

### Input — every text/numeric single-line field

Path: `import { Input } from "@shared/components";`

All of these are variants of one component — don't look for separate `<Email>`, `<Password>`, etc.:

| Need | Prop |
|---|---|
| Text | `type="text"` (default) |
| Email | `type="email"` |
| Password | `type="password"` |
| Number | `type="number"` |
| URL | `type="url"` |
| Tel | `type="tel"` |
| Search | `type="search"` |
| Money (digits + single dot, e.g. `123.45`) | `type="money"` |
| ATM-style (keying `1234` displays `12.34`) | `type="atm"` |
| Multi-line | `type="textarea"` |

Shape:
```tsx
<Input {...form.field("email")} type="email" label={t("Email")} />
```

Always spread `form.field("key")` from `useForm` — that wires value, onChange, errors, and busy state in one prop.

### Select — dropdowns, searchable, async options

Path: `import { Select } from "@shared/components";`

```tsx
<Select
  {...form.field("admin_type")}
  label={t("Admin Type")}
  options={enumOptions(AdminTypeOptions, t)}
/>
```

For searchable user lookup or other async remote options:
```tsx
<Select
  {...form.field("introducer_user_id")}
  label={t("Introducer")}
  searchable
  onSearch={async (query) => {
    const { data } = await api.get("/users/lookup", { params: { q: query } });
    return data.map(u => ({ value: u.id, label: u.username }));
  }}
  loading={searching}
/>
```

### CountrySelect — ISO2 picker sourced from `runtimeStore.countries`

Path: `import { CountrySelect } from "@shared/components";`

Single-select country picker. Reads enabled countries from the injected `window.__APP_CONFIG__` (via `useRuntimeStore`), emits the ISO2 string, renders searchable options labeled "🇲🇾 Malaysia" by default (or "🇲🇾 +60" in calling-code style — pass the hook explicitly if needed; see `useCountryOptions` below).

```tsx
<CountrySelect
  {...form.field("country_iso2")}
  label={t("Country")}
/>
```

Optional filter for allowlisting a subset (e.g., countries where a feature is live):
```tsx
<CountrySelect
  {...form.field("country_iso2")}
  label={t("Country")}
  filter={(iso2) => ALLOWLIST.includes(iso2)}
/>
```

Pair with `.rule(ids::validation::ACTIVE_COUNTRY)` server-side on the request DTO so an iso2 of a disabled country is rejected.

### ContactInput — calling-code picker + digit-only phone

Path: `import { ContactInput } from "@shared/components";`

One visual field containing two coordinated controls: country calling-code select on the left (compact `🇲🇾 +60`), digit-only `<Input type="tel">` on the right. Accepts two `useForm` field bindings — one for `contact_country_iso2`, one for `contact_number` — and writes both independently. Non-digit characters are stripped on keystroke; backend stores digits-only.

```tsx
<ContactInput
  label={t("Contact")}
  countryField={form.field("contact_country_iso2")}
  numberField={form.field("contact_number")}
/>
```

Backend pairs with `crate::validation::is_phone_valid_for_country(iso2, phone)` for per-country phone pattern validation (powered by the `phonenumber` crate — every country libphonenumber knows, which is all of them).

### Checkbox / CheckboxGroup / Radio — boolean and multi-choice

```tsx
<Checkbox {...form.field("is_active")} label={t("Active")} />

<CheckboxGroup
  {...form.field("permissions")}
  label={t("Permissions")}
  options={enumOptions(PermissionOptions, t)}
/>

<Radio
  {...form.field("plan")}
  label={t("Plan")}
  options={[
    { value: "free", label: t("Free") },
    { value: "pro", label: t("Pro") },
  ]}
/>
```

### FileUpload — files, images, documents

```tsx
<FileUpload
  {...form.field("avatar")}
  label={t("Avatar")}
  accept="image/*"
  maxSize={2 * 1024 * 1024}
/>
```

Axios picks up File instances in the payload and sends as multipart automatically — no manual FormData wiring.

### DatePicker / TimePicker / DateTimePicker

```tsx
<DatePicker {...form.field("birthday")} label={t("Birthday")} />
<TimePicker {...form.field("reminder_at")} label={t("Reminder")} />
<DateTimePicker {...form.field("scheduled_at")} label={t("Scheduled at")} />
```

All handle locale + timezone via the runtime config — no manual formatting.

### Button — every clickable

Path: `import { Button } from "@shared/components";`

```tsx
<Button onClick={handler}>{t("Save")}</Button>                    // primary (default)
<Button variant="secondary" onClick={onCancel}>{t("Cancel")}</Button>
<Button variant="danger" onClick={onDelete}>{t("Delete")}</Button>
<Button variant="warning" onClick={onArchive}>{t("Archive")}</Button>
<Button variant="ghost" onClick={onExpand}>{t("More")}</Button>
<Button variant="plain" onClick={onReset}>{t("Reset")}</Button>
<Button variant="link" onClick={onView}>{t("View")}</Button>

<Button type="submit" busy={form.busy} onClick={form.handleSubmit}>{t("Submit")}</Button>

<Button size="sm" prefix={<Plus size={16} />} onClick={onCreate}>{t("New")}</Button>
```

**`Button unstyled`** — when you need clickable behavior but the design requires custom styling (table rows, icon-only cells, sidebar items):
```tsx
<Button
  type="button"
  unstyled
  className="sf-datatable-action"
  onClick={() => openEditModal(row)}
>
  <Pencil size={16} />
</Button>
```

Never drop to `<button>` directly. `Button unstyled` gives the design freedom without losing the component.

### DataTable — server-side lists

Path: `import { DataTable } from "@shared/components";`

```tsx
<DataTable<MyRow>
  api={api}
  url="/datatables/admin.my_resource/query"
  downloadUrl={canExport ? "/datatables/admin.my_resource/download" : undefined}
  columns={columns}
  defaultPerPage={20}
  refreshRef={tableRefresh}
/>
```

Full DataTable usage is documented in the `admin-datatable` skill. This catalog only confirms it exists and where to import.

### Lightbox — image viewer

```tsx
<Lightbox
  items={[{ src: photo.url, title: photo.caption }]}
  open={open}
  onClose={() => setOpen(false)}
/>
```

### FormBuilder / FormField — schema-driven forms

For simple CRUD forms where the field list is known in data form:
```tsx
<FormBuilder
  schema={[
    { key: "name", type: "text", label: t("Name") },
    { key: "plan", type: "select", options: planOptions, label: t("Plan") },
  ]}
  onSubmit={handler}
/>
```

For per-field rendering by type when you need surrounding custom layout:
```tsx
<FormField type="text" value={v} onChange={setV} label={t("Name")} />
```

Prefer explicit `<Input>` / `<Select>` composition for complex layouts (multi-column, conditional fields). Prefer `FormBuilder` when the field set is flat and known. Details in `frontend-form` skill.

## Modal — opening and composing

Path: `import { modal, ModalBody, ModalFooter } from "@shared/modal";`

**Open from an event handler (not JSX):**
```tsx
modal.open(EditUserModal, { userId: row.id, onSaved }, { title: t("Edit User") });
```

The third argument is metadata — title renders in the modal's own header bar. Don't build a fake header inside your modal component.

**Inside the modal component:**
```tsx
import { ModalBody, ModalFooter } from "@shared/modal";

function EditUserModal({ userId, onSaved, onClose }) {
  const form = useForm({ initialValues: {...}, onSubmit: async (v) => {...} });
  return (
    <>
      <ModalBody>
        <Input {...form.field("name")} label={t("Name")} />
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>{t("Cancel")}</Button>
        <Button busy={form.busy} onClick={form.handleSubmit}>{t("Save")}</Button>
      </ModalFooter>
    </>
  );
}
```

**No `<form>` element needed.** Modals don't use native form submission — Save button calls `form.handleSubmit` directly via `onClick`. Header is fixed top, footer fixed bottom, body scrolls.

**`ModalProvider`** — mounted once in `App.tsx`. Your app already has this; don't re-mount.

**`modal.close()` / `modal.closeAll()`** — programmatic close; each modal component also receives `onClose` as a prop for the cancel path.

## Hooks

### useForm — form state, validation, submit, busy tracking

Path: `import { useForm } from "@shared/hooks";`

```tsx
const form = useForm<MyValues>({
  initialValues: { name: "", email: "" },
  onSubmit: async (values) => {
    await api.post<MyResponse>("/resource", values);
    toast.success(t("Saved"));
  },
});
```

- `form.field("key")` — prop bundle for any `@shared/components` control.
- `form.handleSubmit` — async, triggers `onSubmit`.
- `form.busy` — true while `onSubmit` runs.
- `form.values` / `form.setValues` — read / bulk update.
- `form.reset` / `form.isDirty` — reset to initial / dirty-tracking.
- **422 errors are auto-wired.** If the API responds `422 Unprocessable Entity` with field errors, they land on the right fields automatically. You never catch a 422 manually.

### useDebounce — typing-driven queries

```tsx
const debouncedQuery = useDebounce(query, 300);
```

### useInfiniteScroll — paginated feeds

```tsx
const { items, loading, hasMore, loadMore } = useInfiniteScroll({
  api,
  url: "/feed",
  perPage: 20,
});
```

### useCountryOptions — SelectOption[] for country pickers

Path: `import { useCountryOptions } from "@shared/hooks";`

Reactive hook that maps `runtimeStore.countries` (all enabled countries, injected via `window.__APP_CONFIG__`) to `SelectOption[]`. Used internally by `CountrySelect` and `ContactInput`, but also callable directly when you need a country Select with custom shape (e.g., a filter dropdown).

```tsx
const countryOptions = useCountryOptions();                    // default: 🇲🇾 Malaysia
const callingCodeOptions = useCountryOptions("calling_code"); // compact: 🇲🇾 +60
```

## State stores

Path: `import { createStore, useStore } from "@shared/store";`

```tsx
const settingsStore = createStore({ locale: "en", theme: "light" });

export function useLocale() {
  return useStore(settingsStore, (s) => s.locale);
}

// Anywhere in code:
settingsStore.setState({ locale: "zh" });
```

Backed by React's `useSyncExternalStore`. Subscribers re-render on change. Pattern used by `adminBadges`, `runtimeStore`, `localeStore`, and any feature-local state that spans multiple components.

## Infrastructure factories

Each portal already wires these in `src/` — `@shared/*` is what the factories come from, `@/api`, `@/auth`, `@/websocket` are the portal-local instances.

| Factory | Path | Produces | Used in |
|---|---|---|---|
| `createApi` | `@shared/api` | typed axios instance with interceptor | `frontend/<portal>/src/api.ts` |
| `createAuth<T>` | `@shared/auth` | auth actor — login/logout/refresh/useAuth | `frontend/<portal>/src/auth.ts` |
| `createWebSocket` | `@shared/websocket` | WS manager — subscribe/on/useStatus | `frontend/<portal>/src/websocket.ts` |
| `getConfig` / `runtimeStore` | `@shared/config` | runtime bootstrap injected by SPA handler | `frontend/<portal>/src/main.tsx` |

Usage: import from the portal-local file (`@/api`, `@/auth`, `@/websocket`), not from `@shared/*` directly. The portal-local file is the bound instance; `@shared/*` is the factory.

## i18n surface

Path: `import { useTranslation } from "react-i18next"; import { localeStore, useLocale, LOCALE_LABELS } from "@shared/i18n";`

```tsx
const { t } = useTranslation();
<Input label={t("Email")} placeholder={t("Email placeholder")} />

// Switch locale — saves to cookie, re-renders all subscribers
localeStore.setLocale("zh");

// React hook — current locale
const locale = useLocale();
```

Translation files live at project-root `locales/<lang>/*.json`, shared with the Rust backend. Every user-facing string uses `t("key")`. See CLAUDE.md "Translation Rules" for the full discipline.

## Utilities

```tsx
import { enumLabel, enumOptions } from "@shared/utils";
import { AdminTypeOptions } from "@shared/types/generated";

// Enum → translated label for a single value:
enumLabel(AdminTypeOptions, row.admin_type, t)

// Enum → { value, label } array for <Select options={...}>:
enumOptions(AdminTypeOptions, t)
```

Both resolve via the `labelKey` metadata that `forge::AppEnum` generates — canonical path from Rust enum to translated UI label. See `typescript` skill for the generator details.

## Theming — where colors and sf-* classes come from

- **Colors**: CSS variables declared in each portal's `frontend/<portal>/src/styles/app.css` under `@theme { ... }`. E.g., `--color-primary`, `--color-danger`, `--color-danger-hover`, `--color-bg-muted`. Reference via Tailwind's `bg-[var(--color-danger)]` or equivalent. Never hardcode hex.
- **`sf-*` classes**: base shared styles in `frontend/shared/styles/forms.css` imported by each portal's `styles/forms.css`. E.g., `sf-sidebar-item`, `sf-datatable-action`, `sf-page-title`. Each portal can override a specific class by redeclaring it in its own `forms.css`.
- **Tailwind v4 at-rules**: `@theme`, `@layer components`, `@layer base`, `@utility` — these are standard. IDE warnings about "unknown at-rule" usually mean the Tailwind CSS IntelliSense extension isn't installed — install it, don't rename.
- **Custom classes**: declare inside `@layer components` — never as bare `.my-class` at the top level of a global CSS file.

## Icons

```tsx
import { Plus, Pencil, Trash2, Eye } from "lucide-react";
```

`lucide-react` is the only icon library. Don't install `react-icons`, `heroicons`, `feather`, or any other set. Standard sizes: `size={16}` inside controls, `size={20}` for page headers.

## Don't

- **Don't render raw HTML controls in feature/module code.** `<button>`, `<input>`, `<select>`, `<textarea>`, `<form>`-as-event-target are banned. Every such control goes through `@shared/components`. Only `frontend/shared/` internals may touch native controls. `Button unstyled` is the escape hatch for clickable-but-custom-styled cases.
- **Don't inline styles.** `style={{ color: "#ff0000" }}` is banned. Use Tailwind utilities or `sf-*` classes.
- **Don't hardcode colors.** Hex literals in JSX are banned. Use `var(--color-*)` via Tailwind or define a new variable.
- **Don't build custom form state.** `useState` for form fields is banned. Use `useForm`. It handles value, onChange, errors, dirty tracking, 422 auto-wiring, and busy state in one hook.
- **Don't handle API errors with try/catch to show a toast.** Axios interceptors auto-toast non-2xx. Only catch when you need to suppress the toast or do a specific recovery. 422 validation errors specifically are handled by `useForm` — never catch those manually.
- **Don't use an icon library other than `lucide-react`.** No `react-icons`, no `font-awesome` imports in feature code (the admin portal has `font-awesome` in `package.json` as a Froala dep; don't import from it yourself).
- **Don't use relative imports.** `@/` for portal-local, `@shared/` for shared. `../../` is banned except for Vite's `import.meta.glob` locale loader in `main.tsx` (which is a required Vite quirk).
- **Don't build a modal with a custom overlay / header.** Use `modal.open()` with the title metadata. `ModalBody` + `ModalFooter` wrappers are the only structure.
- **Don't add new fonts or external CDN assets without asking.** The portals bundle Inter via WOFF2 — extend deliberately, not casually (CLAUDE.md rule).

## When this skill doesn't fit

- **Adding a new primitive to `@shared/components`** — rare work. First time it happens, document in `references/adding-a-primitive.md` (not yet written). Until then, escalate.
- **Writing the actual page / form / feature** — use the feature skill (`admin-datatable`, `admin-page`, `frontend-form`, `admin-badge`).
- **Backend questions** — different subsystem; see the backend skills.
- **TS type generation** — `typescript` skill.
- **Translation content / i18n key conventions** — CLAUDE.md "Translation Rules" section.
- **Theming overhaul / adding a new design token** — CSS variable work in `frontend/<portal>/src/styles/app.css`; escalate for significant theme changes.
