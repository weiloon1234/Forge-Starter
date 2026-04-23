---
name: admin-page
description: Use when adding an admin-portal page that is NOT a CRUD list backed by a datatable. Typical phrasings: "add an admin dashboard", "admin detail page for X", "settings page", "admin report / analytics page", "admin workflow step", "admin-only viewer for logs / audit". Covers the full flow — optional backend route + DTO + service (for pages that fetch data), frontend page component, router entry, sidebar menu entry, i18n, permission gating. Routes CRUD/list requests to `admin-datatable` and auth/login requests to `new-portal`. Do NOT use for: list/CRUD pages (→ `admin-datatable`); login / auth UI (→ `new-portal`, which scaffolds these); user-portal pages (adapt by analogy — no user-page skill yet); dashboards on the frontend without any backend data (regular component work, no skill needed).
---

# Admin Page — add a non-datatable admin page

## When to invoke

A developer needs an admin-portal page that isn't a server-side list. Typical phrasings:

- "add an admin dashboard with stats"
- "admin detail page for a user / order"
- "settings page for the application"
- "admin report page with charts"
- "audit log viewer"
- "admin profile page"
- "admin-only workflow step page"

Do NOT invoke for:
- **Admin list / CRUD page** — `admin-datatable` handles the entire list + create + edit + delete + menu + i18n.
- **Login / refresh / logout UI** — `new-portal` scaffolds these when a portal is created. Don't re-build.
- **User-portal pages** — this skill is admin-specific. The user portal is minimal; adapt by analogy if needed, or add a `user-page` skill when a second round of user-portal work surfaces real patterns.
- **A pure frontend component with no backend** — regular component work; skill overhead not worth it.

## Concept

An admin page in this starter is:

1. A **route entry** in `frontend/admin/src/router.tsx` (`{ path: "<slug>", element: <<Name>Page /> }`).
2. A **page component** in `frontend/admin/src/pages/<Name>Page.tsx` composed from `@shared/components` primitives.
3. A **menu entry** in `frontend/admin/src/config/side-menu.ts` with permission gating.
4. **i18n keys** in `locales/<lang>/messages.json` under a portal-specific namespace (`admin.<name>.*`).
5. **(Optional) backend**: a REST route in `src/portals/admin/<name>_routes.rs`, request / response DTOs, and a portal-less service function under `src/domain/services/`. Skip if the page reads from an existing endpoint or uses client-only state.

The page itself is thin. Per CLAUDE.md's "Portals are THIN" rule: route handlers call service functions; pages don't re-implement business logic. When a page grows past ~200 lines of JSX, look for a sub-component to extract or a service call to move backend.

Standard non-datatable admin pages render their title/subtitle block through `frontend/admin/src/components/AdminPageHeader.tsx`. Do not hand-write raw `sf-page-header` markup in page components.

## Prerequisites

- [ ] The portal (admin) exists (it always does for this skill's scope).
- [ ] Any permission gating the page exists in `src/ids/permissions.rs`. If new, run `new-permission` first.
- [ ] If the page fetches data, the backend service exists OR you're creating it as part of this skill.
- [ ] If the page uses any `@shared/types/generated` DTO, run `make types` after any new DTO lands in Rust.

## Decisions — answer ALL before writing code

1. **Page kind** — which archetype:
   - **Dashboard** — aggregates + widgets, typically read-only, may poll or subscribe to WS.
   - **Detail view** — a single record shown in detail, possibly with related resources. Read-heavy; may have inline edit links that open modals.
   - **Workflow step** — one page in a multi-step flow (also see `frontend-form` Variant D).
   - **Settings** — a form-heavy page persisting config. Usually delegated to `frontend-form` Variant B.
   - **Report / analytics** — long-form tabular or chart-heavy read view. May have export.
   - **Viewer** — log tail, audit log, event stream, resource inspector.
2. **Backend needs** — does this page:
   - Call an existing endpoint? (No new Rust work.)
   - Need a new endpoint (show / aggregate / export)?
   - Need a new service function for business logic?
   - Need a new DTO (request or response)?
3. **Permission gating** — which `Permission` variant gates the menu + the backend route? Is it the same permission for both, or finer?
4. **Path + menu placement** — URL path (typical `/<name>` or `/<group>/<name>`); which menu group (parent under `users`, `other`, `developer`, or a new group); icon (lucide-react).
5. **Data fetching pattern** — fetch on mount (most common), poll, subscribe to WS channel, or purely client-local? If WS-backed, route to the `admin-badge` skill or the WS system in CLAUDE.md for subscription patterns.
6. **Modals launched** — does the page open any modals (edit, confirm, detail)? If yes, those are `frontend-form` territory.
7. **i18n namespace** — `admin.<name>.*` keys needed (title, subtitle, empty-state copy, action labels).
8. **Downstream** — does this page also need a sidebar badge (→ `admin-badge`) or a related datatable (→ `admin-datatable`)?

Present answers to the user. Confirm. Then proceed.

## Core steps

Run every step. Skip backend steps only if Decision 2 = "call existing endpoint".

### 1. (Backend, if needed) Create the REST handler

Path: `src/portals/admin/<name>_routes.rs`

Single-handler example (show):

```rust
use axum::extract::State;
use forge::prelude::*;

use crate::domain::models::Admin;
use crate::domain::services::<name>_service;
use crate::portals::admin::responses::<Name>Response;

pub async fn show(
    State(app): State<AppContext>,
    i18n: I18n,
    AuthenticatedModel(_actor): Auth<Admin>,
) -> Result<impl IntoResponse> {
    let data = <name>_service::load(&app, &i18n).await?;
    Ok(Json(<Name>Response::from(&data)))
}
```

### 2. (Backend, if needed) Register the route

Edit `src/portals/admin/mod.rs`. Add `pub mod <name>_routes;`, include `<Name>Response` in the response imports, and register the scope:

```rust
admin.scope("/<name>", |scope| {
    scope
        .name_prefix("<name>")
        .tag("admin:<name>")
        .guard(Guard::Admin)
        .permission(Permission::<New>Read);

    scope.get("", "show", <name>_routes::show, |route| {
        route.summary("Get <name> data");
        route.response::<<Name>Response>(200);
    });

    Ok(())
})?;
```

### 3. (Backend, if needed) Create response DTO

Edit `src/portals/admin/responses/<resource>.rs` (create the file + update `responses/mod.rs` barrel if the resource doesn't have one):

```rust
#[derive(Serialize, TS, forge::ApiSchema)]
#[ts(export)]
pub struct <Name>Response {
    pub <field_1>: String,
    pub <field_2>: u64,
    // ...
}
```

### 4. (Backend, if needed) Create the service function

Path: `src/domain/services/<name>_service.rs`

```rust
use forge::prelude::*;

pub async fn load(app: &AppContext, _i18n: &I18n) -> Result<<SomeDomainStruct>> {
    // Business logic lives here, not in the route handler.
    todo!("compose the data this page needs")
}
```

Add `pub mod <name>_service;` in `src/domain/services/mod.rs`.

Run `make types` to regenerate TS bindings for the new response DTO.

### 5. Create the page component

Path: `frontend/admin/src/pages/<Name>Page.tsx`

```tsx
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/api";
import type { <Name>Response } from "@shared/types/generated";

export function <Name>Page() {
  const { t } = useTranslation();
  const [data, setData] = useState<<Name>Response | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await api.get<<Name>Response>("/<name>");
      setData(data);
    })();
  }, []);

  if (!data) return null;

  return (
    <div>
      <AdminPageHeader title={t("<Name>")} />

      {/* page content — see variant extensions */}
    </div>
  );
}
```

Compose the body from `@shared/components` primitives — consult `shared-components` for the catalog. Never raw HTML controls.

### 6. Register the route

Edit `frontend/admin/src/router.tsx`:

```tsx
{ path: "<slug>", element: <<Name>Page /> },
```

### 7. Add the menu entry

Edit `frontend/admin/src/config/side-menu.ts`:

```ts
{
  key: "<group>.<name>",
  label: "admin.<name>.title",   // i18n key
  path: "/<slug>",
  icon: <LucideIcon>,             // optional
  permission: "<module>.<action>",
  // badge: "work.<key>",          // only if a matching admin-badge exists
},
```

### 8. Add i18n keys

Edit `locales/en/messages.json`:

```json
{
  "admin": {
    "<name>": {
      "title": "<Human label>",
      "subtitle": "<one-line purpose>",
      "empty": "<empty-state copy>"
    }
  }
}
```

Mirror in `locales/zh/messages.json` per CLAUDE.md Translation Rules (every non-English locale must have every key).

## Variant extensions

Run the one that matches the page kind from the decision guide.

### Variant: Dashboard

Aggregate widgets, read-only, often polling or WS-driven.

```tsx
export function AdminDashboardPage() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<DashboardResponse | null>(null);

  useEffect(() => {
    const tick = async () => {
      const { data } = await api.get<DashboardResponse>("/dashboard");
      setStats(data);
    };
    void tick();
    const id = setInterval(tick, 30_000);     // poll every 30s if needed
    return () => clearInterval(id);
  }, []);

  if (!stats) return null;

  return (
    <div>
      <h1 className="sf-page-title">{t("Dashboard")}</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
        <StatCard label={t("Users")} value={stats.users} />
        <StatCard label={t("Active")} value={stats.active} />
        <StatCard label={t("Pending")} value={stats.pending} />
      </div>
    </div>
  );
}
```

`StatCard` is a small local component — compose from Tailwind + CSS variables, no inline colors. For WS-driven dashboards, subscribe via the shared admin WebSocket instance (`@/websocket`) — see `admin-badge` for the subscription pattern.

### Variant: Detail view

Single-record deep-dive. Typically has inline action buttons that open edit modals.

```tsx
import { useParams } from "react-router-dom";
import { Button } from "@shared/components";
import { modal } from "@shared/modal";
import { Pencil } from "lucide-react";

export function <Resource>DetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<<Resource>Response | null>(null);

  const load = async () => {
    if (!id) return;
    const { data } = await api.get<<Resource>Response>(`/<resource>s/${id}`);
    setData(data);
  };

  useEffect(() => { void load(); }, [id]);

  if (!data) return null;

  const openEdit = () => {
    modal.open(
      <Resource>FormModal,
      { <resource>Id: data.id, onSaved: load },
      { title: t("Edit <Resource>") },
    );
  };

  return (
    <div>
      <div className="sf-page-header">
        <div>
          <h1 className="sf-page-title">{data.<display_field>}</h1>
          {/* Subtitle is decorative — drop unless it adds value (CLAUDE.md rule 13) */}
        </div>
        <Button type="button" size="sm" prefix={<Pencil size={16} />} onClick={openEdit}>
          {t("Edit")}
        </Button>
      </div>

      {/* detail sections — field groups, related resources, timeline, etc. */}
    </div>
  );
}
```

Form modal comes from `frontend-form` Variant A.

### Variant: Settings page

Full-page form persisting config. Delegates to `frontend-form` Variant B.

```tsx
// Read frontend-form's page-form template. The settings page is a thin wrapper
// around that template bound to the settings endpoint.
```

Router entry: `{ path: "settings", element: <SettingsPage /> }`. Menu entry: permission `settings.manage`.

### Variant: Report / analytics

Heavy-read view. If the report has tabular data, consider whether a datatable makes sense (routes to `admin-datatable`). If it has aggregate-only shape (summary stats, charts), compose directly:

```tsx
export function <Report>Page() {
  const { t } = useTranslation();
  const [filters, setFilters] = useState<{ from: string; to: string }>({ from: "", to: "" });
  const [data, setData] = useState<<Report>Response | null>(null);

  const run = async () => {
    const { data } = await api.get<<Report>Response>("/<report>", { params: filters });
    setData(data);
  };

  return (
    <div>
      <h1 className="sf-page-title">{t("<Report>")}</h1>

      {/* filter row */}
      <div className="flex gap-2 mt-4">
        <DatePicker value={filters.from} onChange={(v) => setFilters(f => ({ ...f, from: v }))} label={t("From")} />
        <DatePicker value={filters.to} onChange={(v) => setFilters(f => ({ ...f, to: v }))} label={t("To")} />
        <Button onClick={run}>{t("Run")}</Button>
      </div>

      {data && <ReportDisplay data={data} />}
    </div>
  );
}
```

Export functionality (CSV / XLSX) typically routes to a separate backend handler returning a file response — pattern in the starter's datatable `/download` endpoints.

### Variant: Viewer (log / audit / resource inspector)

Read-heavy scrolling view. Often infinite-scroll driven:

```tsx
import { useInfiniteScroll } from "@shared/hooks";

export function <Entity>ViewerPage() {
  const { t } = useTranslation();
  const { items, loading, hasMore, loadMore } = useInfiniteScroll<<Entity>Response>({
    api,
    url: "/<entity>s",
    perPage: 50,
  });

  return (
    <div>
      <h1 className="sf-page-title">{t("<Entity>")}</h1>

      <div className="mt-4 space-y-2">
        {items.map(item => <EntityRow key={item.id} item={item} />)}
        {loading && <div className="text-center py-4">{t("Loading")}</div>}
        {hasMore && !loading && (
          <Button variant="secondary" onClick={loadMore} className="w-full">
            {t("Load more")}
          </Button>
        )}
      </div>
    </div>
  );
}
```

## Verify

```bash
make check      # backend compiles if new Rust code
make types      # regen TS bindings for new DTOs
make lint       # Biome + clippy
```

Then manual smoke via `make dev`:
1. Log in as an admin with the required permission → menu shows the new entry.
2. Navigate to the page → page loads, data renders, no console errors.
3. Log in as an admin WITHOUT the permission → menu entry hidden, direct URL navigation either redirects or shows a permission-denied page (per the route's guard config).
4. i18n switch to `zh` → all page strings translate correctly.

## Don't

- **Don't build a CRUD list here.** If the page is "show a sortable filterable list + create + edit + delete", it's `admin-datatable`. Half-building CRUD outside the datatable system forfeits the generic query endpoint, the column permission checks, the export wiring, and consistent UX.
- **Don't build a login page here.** `new-portal` owns login + refresh + logout UI as part of the portal template.
- **Don't put business logic in the route handler.** Handlers are thin — extract request, call service, return response. Services live in `src/domain/services/<name>_service.rs`.
- **Don't skip the permission check.** Every admin page has a `.permission(Permission::<New>)` on its route scope AND a `permission: "<key>"` on its menu entry. The two match; dropping either is a bug.
- **Don't render raw HTML controls.** `<button>`, `<input>`, `<select>`, `<textarea>` are banned. Every control comes from `@shared/components`. See `shared-components`.
- **Don't hand-roll form state.** Any form fields = `useForm` from `@shared/hooks` + `<Input>` / `<Select>` / etc. If the page has a form section, delegate to `frontend-form`.
- **Don't catch API errors to toast them.** Axios interceptors auto-toast non-2xx. Catch only for specific recovery or to suppress.
- **Don't skip non-English locales.** Every `admin.<name>.*` key in `locales/en/messages.json` must have a mirror entry in `locales/zh/messages.json` (and every other locale file). CLAUDE.md hard rule.
- **Don't forget `make types`** if you added a new response / request DTO. Frontend will `any`-type the fields without regeneration.
- **Don't hardcode colors or use inline styles.** Tailwind utilities + CSS variables (`var(--color-*)`) only. `sf-page-title`, `sf-page-subtitle`, `sf-page-header` are pre-existing classes in the portal's `styles/forms.css` — reuse them.

## When this skill doesn't fit

- **List / CRUD page** → `admin-datatable`.
- **Login / refresh / logout** → `new-portal` (already scaffolds these).
- **Adding a form in isolation (inside a modal, not a full page)** → `frontend-form` directly.
- **Adding a sidebar count badge** → `admin-badge`.
- **User portal page** → this skill is admin-specific. Copy + adapt the structure; if a second user-portal pattern emerges, promote to a `user-page` skill.
- **Cross-cutting reference (which `@shared/components` fits field X)** → `shared-components`.
- **Multi-step wizard as its own page** → `frontend-form` Variant D.
