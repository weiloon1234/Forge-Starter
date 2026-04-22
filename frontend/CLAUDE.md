## What This Is

Each portal under `frontend/` is a Vite + React 19 + Tailwind v4 SPA. Portals share primitives via `@shared/*` and never hand-write form controls, enum unions, DTO shapes, or translation copies — those all flow from the Rust backend + the project-root `locales/` tree. This file covers frontend-specific rules, the shared primitive catalog, and the SSOT contract between Rust and TypeScript.

Procedures for specific frontend work (adding a form, a page, a store, etc.) live in skills under `.claude/skills/`. This file is the reference + discipline layer; skills are the step-by-step.

## Skills for frontend work

Quick index — each skill has a triggering `description` that surfaces it when relevant phrasings appear:

| Skill | Use when |
|---|---|
| [`shared-components`](../.claude/skills/shared-components/SKILL.md) | Picking a primitive (Input / Select / Button / Modal / ...) or questioning whether a raw HTML control is allowed (it isn't) |
| [`frontend-form`](../.claude/skills/frontend-form/SKILL.md) | Building a form — modal, page, wizard, settings — via `useForm` |
| [`new-store`](../.claude/skills/new-store/SKILL.md) | Adding a shared-state store via `createStore` + selector hooks |
| [`admin-page`](../.claude/skills/admin-page/SKILL.md) | Non-datatable admin page (dashboard, detail, workflow, settings, report, viewer) |
| [`admin-datatable`](../.claude/skills/admin-datatable/SKILL.md) | Admin list / CRUD page (DataTable + modals + menu + i18n) |
| [`admin-badge`](../.claude/skills/admin-badge/SKILL.md) | Sidebar count indicator |
| [`typescript`](../.claude/skills/typescript/SKILL.md) | Understanding / extending the Rust → TS generation pipeline |

Root `CLAUDE.md` indexes all 22 skills including backend + cross-cutting.

## Rules

1. **Feature / module code MUST use shared primitives.** Pages, layouts, modals, and feature components use `@shared/components`, `@shared/hooks`, `@shared/modal`, `@shared/store`, etc. Raw native HTML controls — `<button>`, `<input>`, `<select>`, `<textarea>`, `<form>` as an event target — are banned outside `frontend/shared/` infrastructure internals. `<Button unstyled>` is the escape hatch for clickable-but-custom-styled cases (table rows, icon-only triggers, sidebar items).
2. **NEVER inline styles.** No `style={{ ... }}`. Use Tailwind utilities or `sf-*` classes from the portal CSS.
3. **NEVER build custom form state.** Always `useForm` from `@shared/hooks`. It handles value, errors, submit, reset, dirty, busy — and auto-wires 422 field errors from the API.
4. **NEVER handle API errors manually.** Axios interceptors auto-toast non-2xx responses. `useForm` auto-maps 422 field errors. Catch only for specific recovery or toast suppression.
5. **NEVER hardcode colors.** Use CSS variables (`var(--color-primary)`, `var(--color-danger)`, etc.) defined in each portal's `styles/app.css` `@theme { ... }` block.
6. **Icons: use `lucide-react`.** Import directly. No `react-icons`, no `heroicons`, no `feather`, no Font Awesome (Admin portal has Font Awesome as a Froala editor transitive dep — do not import from it in your own code).
7. **Tailwind v4 CSS-first.** Use `@theme`, `@layer components`, `@layer base`, `@utility` directives — standard Tailwind v4 at-rules, NOT "unknown at-rules". If your IDE flags them, install the Tailwind CSS IntelliSense extension. Custom classes go inside `@layer components`; custom utilities via `@utility`. Never invent bare classes at the top level of a CSS file.
8. **NEVER use relative path imports.** `@/` for portal-local, `@shared/` for shared. Relative `../../` is banned except for `main.tsx` loading locales via `import.meta.glob` (Vite requirement).

## SSOT — Rust → TypeScript

The frontend never hand-writes types that exist on the backend. Every type a handler / page / service touches crosses the boundary via generated TypeScript, produced by `make types`.

### DTOs — one struct, four roles

Each Rust DTO in `src/portals/<portal>/{requests,responses}.rs` serves **four purposes simultaneously** from a single declaration. Understanding this is the core of the frontend's relationship with the backend:

1. **Validation surface** — the DTO's `#[derive(Validate)]` or `impl RequestValidator` runs server-side before the handler sees the request. Frontend does NOT reimplement validation.
2. **Wire contract** — `serde::Deserialize` (Request) / `serde::Serialize` (Response) + `forge::ApiSchema` drives the actual HTTP payload + the OpenAPI schema.
3. **TypeScript type** — `ts_rs::TS` + `#[ts(export)]` emits `frontend/shared/types/generated/<Name>.ts` on `make types`.
4. **React form's value type** — `useForm<CreateFooRequest>` binds directly to the generated Request type. `values` IS a `CreateFooRequest`. No intermediate `FormValues` interface needed when the form shape matches the Request 1:1.

```rust
#[derive(Debug, Deserialize, ts_rs::TS, forge::ApiSchema)]   // request
#[ts(export)]
pub struct CreateUserRequest { pub email: String, pub name: String }

#[derive(Serialize, ts_rs::TS, forge::ApiSchema)]            // response
#[ts(export)]
pub struct UserResponse { pub id: String, pub email: String, /* ... */ }
```

Running `make types` emits one `.ts` per DTO to `frontend/shared/types/generated/`. Consume directly:

```tsx
import type { CreateUserRequest, UserResponse } from "@shared/types/generated";
import { useForm } from "@shared/hooks";
import { api } from "@/api";

const form = useForm<CreateUserRequest>({         // ← typed against the generated Request
  initialValues: { email: "", name: "" },
  onSubmit: async (values) => {                   // values IS CreateUserRequest
    await api.post<UserResponse>("/users", values);
  },
});
```

The fourth role is the most often violated. Default: type the form against the generated Request. No separate `FormValues` interface. No hand-written mapping from form state to Request.

**When a local `FormValues` type is justified** (exception, not default):
- Password + confirm-password fields (the Request has one `password`, the form has two)
- Search-query state for `<Select searchable onSearch={...}>` that doesn't submit to the server
- Preview / computed values displayed but not sent
- Unified create-or-edit modals where `CreateRequest` and `UpdateRequest` have different shapes (Update typically has `Option<T>` everywhere) — the form carries a superset and maps to the right Request on submit

In those cases, define the local `FormValues`, and map to the Request in `onSubmit`. Otherwise: one struct, four roles, one TypeScript alias, one `useForm` type parameter.

Do NOT hand-write a matching TS Request type on the frontend. The generated file is the single source; every edit is overwritten on the next `make types`.

### Enums — four exports per enum file

Rust enum with `#[derive(forge::AppEnum)]` in `src/domain/enums/<name>.rs` (or file-private inside a model):

```rust
#[derive(Clone, Copy, Debug, PartialEq, Eq, forge::AppEnum)]
pub enum AdminType {
    SuperAdmin,
    Developer,
    Admin,
}
```

`make types` generates `frontend/shared/types/generated/AdminType.ts` with FOUR named exports:

```ts
export type AdminType = "super_admin" | "developer" | "admin";

export const AdminTypeValues = [...] as const;            // bare values — iteration / includes checks
export const AdminTypeOptions = [                         // { value, labelKey } — Select options + enum labels
  { value: "super_admin", labelKey: "enum.admin_type.super_admin" },
  { value: "developer", labelKey: "enum.admin_type.developer" },
  { value: "admin", labelKey: "enum.admin_type.admin" },
] as const;
export const AdminTypeMeta = { id, keyKind, options };    // framework metadata
```

Consume via helpers from `@shared/utils`:

```tsx
import { AdminTypeOptions, type AdminType } from "@shared/types/generated";
import { enumOptions, enumLabel } from "@shared/utils";
import { useTranslation } from "react-i18next";

const { t } = useTranslation();

<Select
  {...form.field("admin_type")}
  label={t("Admin Type")}
  options={enumOptions(AdminTypeOptions, t)}                // { value, label } array for Select
/>

// Inside a DataTable column render:
render: (row) => enumLabel(AdminTypeOptions, row.admin_type, t)
```

`labelKey` always follows `enum.<snake_name>.<variant>` — the key MUST exist in every locale's `messages.json` (see SSOT — shared i18n below). Without the i18n entry, `enumLabel` falls back to the wire key and users see `"super_admin"` instead of `"Super Admin"`.

Do NOT hand-write a parallel TS union or Options array. The Rust enum is the single source; the Rust side adds a variant, `make types` regenerates, the frontend consumer immediately sees the new variant.

### Permissions

`Permission` enum in `src/ids/permissions.rs` ships with the same `forge::AppEnum` treatment, so `frontend/shared/types/generated/Permission.ts` gets the union type + `PermissionValues` + `PermissionOptions` + `PermissionMeta`. The admin portal's `usePermission(key)` hook takes the typed `Permission` union; misspellings fail at compile time.

### When to regenerate

`make types` runs as a dependency of `make dev` and `make build` — automatically regenerated on every dev loop. You only invoke it manually to force a refresh mid-session.

**Commit the generated files** — they're tracked in git; every branch must have `generated/` matching its Rust source. Hand-editing any file under `generated/` is wasted work (overwritten on next run) and a merge-conflict magnet.

### Deeper reference

See the `typescript` skill for: full `#[ts(type = "...")]` attribute cheat-sheet, `forge::TS` vs `forge::ApiSchema` distinction, `BTreeMap` / `HashMap` / complex-type workarounds (the `serde_json::Value` trick), integer-width gotchas (`u64` → `bigint`), and `Option<T>` → `T | null` semantics.

## SSOT — shared i18n

Translation files live at **project root** `locales/<lang>/` and are shared between the Rust backend (`t!(i18n, "key")` macro) and React frontend (`t("key")` from `react-i18next`). Same files, same `{{variable}}` syntax, same keys. The frontend does NOT have its own `locales/` folder.

```
locales/
├── en/
│   ├── messages.json       ← shared with backend
│   └── validation.json     ← shared with backend
└── zh/
    ├── messages.json
    └── validation.json
```

`main.tsx` loads them via Vite's `import.meta.glob` (the one permitted relative import):

```tsx
const localeModules = import.meta.glob("../../../locales/**/*.json", { eager: true });
initI18n(buildResources(localeModules), { defaultLocale: runtimeConfig.default_locale });
```

### The "English-as-key" model

English is both the fallback and — for static strings — the key itself:

```tsx
t("Save")                    // → "Save"  (no en.json entry needed — fallback returns the key)
t("Welcome")                 // → "Welcome"
t("Password changed")        // → "Password changed"

t("greeting", { name })      // → "Hello, Wei!"  (parameterized — MUST have en.json entry)
```

Three key styles, chosen per string:

1. **Static user-facing strings** — English text as the key: `t("Save")`, `t("Welcome")`. **Skip the English JSON entry** (key == value — i18next returns the key as fallback). Non-English locales translate to the actual word.
2. **Parameterized strings** — always have an English entry because the key alone isn't readable: `{"greeting": "Hello, {{name}}!"}`. Every locale needs this entry.
3. **Coded / namespaced keys** — `admin.users.columns.introducer`, `enum.admin_type.super_admin`. Reserved for programmatic / convention-driven translations (AppEnum `labelKey`, field-name conventions). Not for arbitrary user strings.

### Key rules you'll hit regularly

- **Key == value: do NOT add the English entry.** `"Hello": "Hello"` in `en.json` is pointless. i18next returns the key string when lookup fails; that IS the English rendering.
- **Every non-English locale MUST have every key the code references.** If `en.json` has it (explicit or implicit via `t("Save")`), `zh.json` must have it too. A missing `zh.json` entry means Chinese users see English — a bug, not a fallback.
- **NEVER concatenate translated strings.** `` `${t("Hello")} ${name}` `` breaks word order in Chinese / Arabic / etc. Use parameterized `t("greeting", { name })` with the full sentence as one key.
- **Always parameterize.** `t("welcome_user", { name })`, not string templating with two `t()` calls.
- **Backend error messages ALSO use `t!(i18n, "key")`.** The frontend displays backend-returned messages in toasts (via the axios interceptor) — they must be translatable keys, not raw English strings. Every `Error::http(400, t!(i18n, "error.invalid_input"))` in Rust code lands as a localized toast on the frontend automatically.
- **Group parameterized keys together** in the JSON file for readability.

### Full rule list

This section is an operational summary. The canonical 10-rule discipline lives in root `CLAUDE.md` under "Translation Rules" — consult it when in doubt.

### Locale switching + display

```tsx
import { localeStore, useLocale, LOCALE_LABELS } from "@shared/i18n";

localeStore.setLocale("zh");                 // saves to cookie, re-renders subscribers
const locale = useLocale();                  // current locale
LOCALE_LABELS["zh"]                          // "中文" (display name)
```

Cookie-backed. Authenticated users also have a `locale` column on their model — update via `api.put("/profile/locale", { locale })` when the user changes language (admin portal already does this; see `frontend/admin/src/App.tsx`).

## Commands

- `make check` — `cargo check` (fast type-check)
- `make lint` — Rust clippy + Biome frontend lint
- `make lint:fix` — rustfmt + Biome auto-fix
- `make types` — regenerate `frontend/shared/types/generated/` from Rust DTOs + AppEnum enums (auto-runs on `make dev` and `make build`)

## Component Map

Quick reference for "which primitive maps to which need". Authoritative catalog + per-component usage depth lives in the `shared-components` skill.

| Need | Use | Import |
|------|-----|--------|
| Text / Email / Password / Number / URL / Tel / Search input | `<Input>` | `@shared/components` |
| Money input (digits + max one dot: `123.45`) | `<Input type="money">` | `@shared/components` |
| ATM-style input (key `1234` → displays `12.34`) | `<Input type="atm">` | `@shared/components` |
| Multi-line text | `<Input type="textarea">` | `@shared/components` |
| Dropdown / searchable / async options | `<Select>` | `@shared/components` |
| Single checkbox | `<Checkbox>` | `@shared/components` |
| Multiple checkboxes from options | `<CheckboxGroup>` | `@shared/components` |
| Radio options | `<Radio>` | `@shared/components` |
| File upload with preview | `<FileUpload>` | `@shared/components` |
| Date picker (calendar) | `<DatePicker>` | `@shared/components` |
| Time picker (HH:mm) | `<TimePicker>` | `@shared/components` |
| Date + Time combined | `<DateTimePicker>` | `@shared/components` |
| Button (primary/secondary/danger/warning/ghost/plain/link) | `<Button>` | `@shared/components` |
| Clickable-but-custom-styled wrapper (not a raw `<button>`) | `<Button unstyled>` | `@shared/components` |
| Image viewer with title/subtitle | `<Lightbox>` | `@shared/components` |
| Server-side data table | `<DataTable>` | `@shared/components` |
| Build form from JSON config | `<FormBuilder>` | `@shared/components` |
| Render field by type | `<FormField>` | `@shared/components` |

## Systems

Hooks, stores, factories, and helpers. Authoritative usage lives in `shared-components` skill + feature skills (`frontend-form`, `new-store`).

| Need | Use | Import |
|------|-----|--------|
| Form state + validation + submit + 422 auto-wiring | `useForm()` | `@shared/hooks` |
| Debounce (for search inputs) | `useDebounce(fn, ms)` | `@shared/hooks` |
| Infinite scroll (paginated feeds) | `useInfiniteScroll({ api, url })` | `@shared/hooks` |
| Open a modal | `modal.open(Component, props, { title })` | `@shared/modal` |
| Modal body / footer wrappers | `<ModalBody>` / `<ModalFooter>` | `@shared/modal` |
| Close modal programmatically | `modal.close()` / `modal.closeAll()` | `@shared/modal` |
| Render modal stack (once in App.tsx) | `<ModalProvider />` | `@shared/modal` |
| Create a custom shared-state store | `createStore()` / `useStore()` | `@shared/store` |
| Runtime config (app_url, ws_url, locales, settings, countries) | `getConfig()` / `runtimeStore` | `@shared/config` |
| Get / set locale (cookie-backed) | `localeStore.setLocale("zh")` | `@shared/i18n` |
| React hook for current locale | `useLocale()` | `@shared/i18n` |
| Locale display labels (`"en"` → `"English"`) | `LOCALE_LABELS` | `@shared/i18n` |
| Translate text | `t("key")` / `t("greeting", { name })` | `react-i18next` |
| Init i18n (once in main.tsx) | `initI18n(resources)` | `@shared/i18n` |
| WebSocket manager (per-portal) | `createWebSocket(config)` | `@shared/websocket` |
| API client (per-portal instance) | `api.get/post/put/patch/delete` | `@/api` |
| Set / clear auth token | `setToken(token)` | `@shared/api` |
| Auth actor (per-portal) | `auth.login/logout/useAuth/onAuthChange` | `@/auth` |
| Create auth actor factory | `createAuth<T>({ api, mode, paths })` | `@shared/auth` |
| Check auth on mount | `auth.check()` | `@/auth` |
| Toast notification | `toast.success()` / `toast.error()` | `sonner` |
| Render toasts (once in App.tsx) | `<Toaster />` | `sonner` |
| Enum helpers (Select options + labels) | `enumOptions` / `enumLabel` | `@shared/utils` |
| Classname composition helper (if used) | `cn` / `clsx` | check existing imports |

## When to Use What

**Modal** — for content that overlays the page: confirm dialogs, edit forms, detail views. Open via `modal.open()` from event handlers (not JSX). Every modal gets an overlay automatically.

Modal structure: `modal.open(Component, props, { title: "..." })` renders a header (title + close button) automatically. The component uses `<ModalBody>` and `<ModalFooter>` wrappers:

```tsx
import { ModalBody, ModalFooter } from "@shared/modal";

function EditModal({ name, onClose }: { name: string; onClose: () => void }) {
  const { t } = useTranslation();
  const form = useForm({ initialValues: { name }, onSubmit: async (v) => { /* ... */ } });
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

// Open it:
modal.open(EditModal, { name: "Wei" }, { title: t("Edit Profile") });
```

No `<form>` element needed — Save button calls `form.handleSubmit` on `onClick`. Header is fixed top, footer fixed bottom, body scrolls. See `frontend-form` skill for variants (page form, wizard, confirm-action).

**Lightbox** — specifically for viewing images. Use when clicking a thumbnail should show the full image. Supports lists with arrow navigation.

**Select with `searchable` + `onSearch`** — for server-side searchable options (user lookup, async enum sourcing). Set `searchable` to enable the input, `onSearch` for async calls, `loading` while fetching.

**FormBuilder vs explicit `<Input>` composition** — `FormBuilder` when the field list is flat and known (schema-driven); explicit composition for multi-column layouts / conditional fields / mixed widgets. The `frontend-form` skill has the full decision guide.

## Styling Architecture

```
shared/components/          render only sf-* class names — no Tailwind utilities in shared
        ↓
shared/styles/forms.css     base sf-* definitions (SSOT, imported by each portal)
        ↓
each portal's styles/forms.css      @import shared base + portal-specific sf-* overrides
        ↓
each portal's styles/app.css        @theme { --color-primary: ...; }
                                    CSS variables = single source for colors
```

Same shared component, different look per portal — override via portal-local `forms.css`, not by editing `@shared/`.

**CSS variable SSOT.** Colors live in each portal's `styles/app.css` inside `@theme { ... }` (e.g., `--color-primary`, `--color-danger`, `--color-bg-muted`). Reference via Tailwind `bg-[var(--color-danger)]` or CSS `color: var(--color-primary)`. Never hardcode hex in JSX or component CSS.

**Tailwind v4 at-rules.** `@theme`, `@layer components`, `@layer base`, `@utility` are standard. If the IDE warns "unknown at-rule", install the Tailwind CSS IntelliSense extension.

## File Structure

```
frontend/
├── shared/                  ← imported as @shared
│   ├── components/          ← UI components + FieldMessages helper
│   ├── hooks/               ← useForm, useDebounce, useInfiniteScroll
│   ├── store/               ← createStore, useStore
│   ├── modal/               ← modal.open/close, ModalProvider, ModalBody, ModalFooter
│   ├── auth/                ← createAuth factory
│   ├── api/                 ← createApi factory (sends Accept-Language header)
│   ├── i18n/                ← initI18n, localeStore, useLocale, LOCALE_LABELS
│   ├── websocket/           ← createWebSocket factory (token auth, auto-reconnect)
│   ├── config/              ← getConfig() + runtimeStore (reads window.__APP_CONFIG__)
│   ├── utils/               ← enumOptions, enumLabel, cookie helpers
│   ├── styles/forms.css     ← SSOT base sf-* classes
│   ├── types/
│   │   ├── form.ts          ← component prop types
│   │   └── generated/       ← auto from Rust DTOs + AppEnum (make types)
│   └── index.ts
├── admin/
│   └── src/
│       ├── api.ts           ← createApi({ baseURL: "/api/v1/admin" })
│       ├── auth.ts          ← createAuth token mode, bound to AdminMeResponse
│       ├── websocket.ts     ← createWebSocket with admin ws-token exchange
│       ├── stores/          ← admin-specific stores (adminBadges, etc.)
│       ├── styles/app.css   ← admin theme + sonner theme
│       ├── styles/forms.css ← imports shared base + admin overrides
│       └── App.tsx          ← <ModalProvider /> + <Toaster /> + auth.onAuthChange wiring
└── user/
    └── src/
        ├── api.ts           ← createApi({ baseURL: "/api/v1/user" })
        ├── auth.ts          ← createAuth token mode, bound to UserResponse
        ├── styles/app.css   ← user theme + sonner theme
        ├── styles/forms.css ← imports shared base + user overrides
        └── App.tsx          ← <ModalProvider /> + <Toaster />
```

## Typical Page Pattern

```tsx
import { useForm } from "@shared/hooks";
import { Input, Select, Button } from "@shared/components";
import { api } from "@/api";
import type { CreateUserRequest, UserResponse } from "@shared/types/generated";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

export function CreateUserPage() {
  const { t } = useTranslation();
  const form = useForm<CreateUserRequest>({
    initialValues: { email: "", name: "", role: "user" },
    onSubmit: async (values) => {
      await api.post<UserResponse>("/users", values);
      toast.success(t("admin.users.created"));
      // 422 errors auto-wired: field errors + toast
    },
  });

  return (
    <div>
      <h1 className="sf-page-title">{t("admin.users.create_title")}</h1>
      <Input {...form.field("email")} type="email" label={t("Email")} />
      <Input {...form.field("name")} label={t("Name")} />
      <Select {...form.field("role")} label={t("Role")} options={roleOptions} />
      <Button busy={form.busy} onClick={form.handleSubmit}>{t("Create")}</Button>
    </div>
  );
}
```

Every primitive is imported from `@shared/components`. Every text string goes through `t()`. DTO types come from `@shared/types/generated`. No `useState` for form fields, no raw `<button>`, no inline colors, no hand-written enum option arrays. The full `frontend-form` skill covers modal forms, wizards, and the `useForm` + 422 auto-wiring pattern in depth.
