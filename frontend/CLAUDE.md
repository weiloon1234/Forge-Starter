## Commands

- `make check`
- `make lint`
- `make types`
- `make lint:fix`

## Rules

1. **Feature/module code MUST use shared primitives** — pages, layouts, modals, and feature components should use `@shared/components`, `@shared/hooks`, and `@shared/modal`. Raw native controls are only acceptable inside `frontend/shared` infrastructure components. If a portal-specific button style already exists, use `<Button unstyled ...>` instead of raw `<button>`.
2. **NEVER inline styles** — use Tailwind utilities or `sf-*` classes from the portal CSS.
3. **NEVER build custom form state** — use `useForm` hook. It handles values, errors, submit, reset, dirty, busy.
4. **NEVER handle API errors manually** — axios interceptors auto-show toast notifications. `useForm` auto-sets field errors from 422 responses.
5. **NEVER hardcode colors** — use CSS variables (`var(--color-primary)`, etc.) defined in each portal's `app.css`.
6. **Icons: use `lucide-react`** — import from `lucide-react` directly. No other icon library.
7. **Tailwind v4 CSS-first** — use `@theme`, `@layer components`, `@layer base`, `@utility` directives. These are the standard Tailwind v4 at-rules — they are NOT "unknown at-rules." If your IDE shows warnings about `@theme` or `@apply`, install the **Tailwind CSS IntelliSense** extension. Never use non-canonical utility classes (e.g., inventing `@apply my-custom-thing`) — define custom classes inside `@layer components` or register custom utilities via `@utility`.
8. **NEVER use relative path imports (`../`, `../../`)** — always use alias imports: `@/` for portal-local, `@shared/` for shared. The only exception is `main.tsx` loading locales via `import.meta.glob` (Vite requirement).

## Component Map

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
| Image viewer with title/subtitle | `<Lightbox>` | `@shared/components` |
| Server-side data table | `<DataTable>` | `@shared/components` |
| Build form from JSON config | `<FormBuilder>` | `@shared/components` |
| Render field by type | `<FormField>` | `@shared/components` |

## Systems

| Need | Use | Import |
|------|-----|--------|
| Form state + validation + submit | `useForm()` | `@shared/hooks` |
| Open a modal | `modal.open(Component, props, { title })` | `@shared/modal` |
| Modal body wrapper | `<ModalBody>` | `@shared/modal` |
| Modal footer wrapper | `<ModalFooter>` | `@shared/modal` |
| Close modal | `modal.close()` / `modal.closeAll()` | `@shared/modal` |
| Render modal stack (once in App.tsx) | `<ModalProvider />` | `@shared/modal` |
| Runtime config (app_url, ws_url, etc.) | `getConfig()` | `@shared/config` |
| Locale display labels | `LOCALE_LABELS` | `@shared/i18n` |
| WebSocket manager | `createWebSocket(config)` | `@shared/websocket` |
| Toast notification | `toast.success()` / `toast.error()` | `sonner` |
| Render toasts (once in App.tsx) | `<Toaster />` | `sonner` |
| API calls (per-portal instance) | `api.get/post/put/patch/delete` | `@/api` |
| Set/clear auth token | `setToken(token)` | `@shared/api` |
| Create custom store | `createStore()` / `useStore()` | `@shared/store` |
| Debounce (for search) | `useDebounce(fn, ms)` | `@shared/hooks` |
| Translate text | `t("key")` / `t("greeting", { name })` | `react-i18next` |
| Get/set locale (cookie) | `localeStore.setLocale("zh")` | `@shared/i18n` |
| React hook for locale | `useLocale()` | `@shared/i18n` |
| Init i18n (once in main.tsx) | `initI18n(resources)` | `@shared/i18n` |
| Auth actor (per-portal) | `auth.login/logout/useAuth` | `@/auth` |
| Create auth actor | `createAuth<T>({ api, mode, paths })` | `@shared/auth` |
| Check auth on mount | `auth.check()` | `@/auth` |
| Data table (server-side) | `<DataTable>` | `@shared/components` |
| Infinite scroll (paginated) | `useInfiniteScroll({ api, url })` | `@shared/hooks` |

## When to Use What

**Modal** — for any content that overlays the page: confirm dialogs, edit forms, detail views. Use `modal.open()` from event handlers, not JSX. Every modal gets an overlay automatically.

Modal structure: `modal.open(Component, props, { title: "..." })` renders a header (title + close) automatically. The component uses `<ModalBody>` and `<ModalFooter>` wrappers:

```tsx
import { ModalBody, ModalFooter } from "@shared/modal";

function EditModal({ name, onClose }) {
  const form = useForm({ initialValues: { name }, onSubmit: async (v) => { ... } });
  return (
    <>
      <ModalBody>
        <Input {...form.field("name")} label="Name" />
      </ModalBody>
      <ModalFooter>
        <Button onClick={onClose}>Cancel</Button>
        <Button busy={form.busy} onClick={form.handleSubmit}>Save</Button>
      </ModalFooter>
    </>
  );
}

// Open it:
modal.open(EditModal, { name: "Wei" }, { title: "Edit Profile" });
```

No `<form>` element needed — call `form.handleSubmit` directly on button click. Header is fixed top, footer fixed bottom, body scrolls.

**Lightbox** — specifically for viewing images. Use when clicking a thumbnail should show the full image. Supports image lists with arrow navigation.

**Select with `searchable` + `onSearch`** — for server-side search (e.g., user lookup). Set `searchable` to enable the search input, `onSearch` for async server calls, `loading` while fetching.

## i18n (Translations)

Same JSON files, same `{{variable}}` syntax, shared between Rust backend and React frontend.

**Files live in project root** `locales/` (not in frontend/):
```
locales/
├── en/
│   ├── messages.json      ← shared with backend
│   └── validation.json    ← shared with backend
└── zh/
    ├── messages.json
    └── validation.json
```

The root `locales/` tree is the SSOT for both React portals and the Rust backend. Do not create a separate frontend-only locale folder.

English is the fallback and the key:
- If key = display text, skip the English entry.
- Add English entries only when the display text differs from the key or the string is parameterized.

**Syntax** (identical in Rust `t!()` macro and React `t()` function):
```json
{ "greeting": "Hello, {{name}}!" }
```

**Usage in components:**
```tsx
import { useTranslation } from "react-i18next";

function LoginPage() {
  const { t } = useTranslation();
  return <Input label={t("auth.login")} placeholder={t("auth.email")} />;
}
```

**Switch locale:**
```tsx
import { localeStore } from "@shared/i18n";
localeStore.setLocale("zh");  // saves to cookie + updates all components
```

**Locale store** — cookie-based for now. Later: save to DB per authenticated user.

**FormBuilder** — for simple CRUD forms where the field list is known. For complex layouts (multi-column, conditional fields), use components directly.

## Styling Architecture

```
shared/components/ → render sf-* class names only (no Tailwind utilities)
                                    ↓
shared/styles/forms.css → base sf-* definitions (SSOT, imported by both portals)
                                    ↓
each portal's styles/forms.css → @import shared base + portal-specific overrides
                                    ↓
each portal's styles/app.css → @theme { --color-primary: ...; }
```

Same component, different look per portal. To customize a component's appearance, edit your portal's `forms.css`.

## File Structure

```
frontend/
├── shared/                  ← imported as @shared
│   ├── components/          ← UI components + FieldMessages helper
│   ├── hooks/               ← useForm, useDebounce, useDataTable, useInfiniteScroll
│   ├── store/               ← createStore, useStore
│   ├── modal/               ← modal.open/close, ModalProvider, ModalBody, ModalFooter
│   ├── auth/                ← createAuth factory
│   ├── api/                 ← createApi factory (sends Accept-Language)
│   ├── i18n/                ← initI18n, localeStore, useLocale, LOCALE_LABELS
│   ├── websocket/           ← createWebSocket factory (token auth, auto-reconnect)
│   ├── config/              ← getConfig() — reads window.__APP_CONFIG__ from SPA bootstrap
│   ├── utils/               ← cookie helpers, shared utilities
│   ├── styles/forms.css     ← SSOT base sf-* classes (imported by portals)
│   ├── types/
│   │   ├── form.ts          ← all component prop types
│   │   └── generated/       ← auto from Rust DTOs (make types)
│   └── index.ts
├── admin/
│   └── src/
│       ├── api.ts           ← createApi({ baseURL: "/admin" })
│       ├── auth.ts          ← createAuth token mode
│       ├── styles/app.css   ← indigo theme + sonner theme
│       ├── styles/forms.css ← imports shared base + admin overrides
│       └── App.tsx           ← <ModalProvider /> + <Toaster />
└── user/
    └── src/
        ├── api.ts           ← createApi({ baseURL: "/api/v1" })
        ├── auth.ts          ← createAuth token mode
        ├── styles/app.css   ← blue theme + sonner theme
        ├── styles/forms.css ← imports shared base + user overrides
        └── App.tsx           ← <ModalProvider /> + <Toaster />
```

## Typical Page Pattern

```tsx
import { useForm } from "@shared/hooks";
import { Input, Select, Button } from "@shared/components";
import { api } from "@/api";
import type { CreateUserRequest, UserResponse } from "@shared/types/generated";

export function CreateUserPage() {
  const form = useForm<CreateUserRequest>({
    initialValues: { email: "", name: "", role: "" },
    onSubmit: async (values) => {
      await api.post<UserResponse>("/users", values);
      // 422 errors auto-handled: toast + field errors
    },
  });

  return (
    <form onSubmit={form.handleSubmit}>
      <Input {...form.field("email")} type="email" label="Email" />
      <Input {...form.field("name")} label="Name" />
      <Select {...form.field("role")} label="Role" options={roleOptions} />
      <Button type="submit" busy={form.busy}>Create User</Button>
    </form>
  );
}
```

## Generated Types

Rust DTOs auto-generate TypeScript types. Run `make types` after changing any request/response struct.

```
Rust struct + #[derive(ts_rs::TS)]  →  frontend/shared/types/generated/*.ts
```

Import: `import type { LoginRequest } from "@shared/types/generated"`
