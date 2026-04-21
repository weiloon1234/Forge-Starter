---
name: new-store
description: Use when adding a new frontend shared-state store — a `createStore`-backed container for state that spans multiple components / hooks / pages within a portal. Typical phrasings: "add a shopping cart store", "global notification state", "store for admin's active filters", "track unread count across components", "persistent sidebar collapsed state". Covers choosing portal-local vs shared placement, the state shape + imperative API + selector-hook pattern, and the typical lifecycle (hydrate on mount, update via imperative setters, reset on logout). Do NOT use for: form state (→ `useForm` from `@shared/hooks` — never build custom form state); component-local state that doesn't need sharing (→ `useState` / `useReducer` in-place); server state that a single fetch handles (→ direct `api.get` in `useEffect`; no store needed); auth state (→ `auth.useAuth()` from `@/auth`); locale state (→ `localeStore` / `useLocale` from `@shared/i18n`); runtime config (→ `runtimeStore` / `getConfig` from `@shared/config`).
---

# New Store — add a frontend shared-state store

## When to invoke

A developer needs state that spans multiple components / pages / hooks and doesn't fit an existing specialized store. Typical phrasings:

- "add a cart store for the checkout flow"
- "store for the admin's currently-active filter set"
- "track unread notifications across components"
- "persistent sidebar-collapsed state"
- "global recent-search history"
- "expose app-wide feature flags"

Do NOT invoke for:
- **Form state** — always `useForm` from `@shared/hooks`. Never build custom form state; see `frontend-form`.
- **Component-local UI state** — `useState` / `useReducer` in the component. Don't promote to a store unless multiple components need it.
- **One-off API fetch** — `useEffect` + `api.get` + local `useState` is fine. Stores are for state that either persists across route changes OR is mutated by multiple sources.
- **Auth state** — `auth.useAuth()` from `@/auth`. Already a store under the hood.
- **Locale state** — `localeStore` / `useLocale` from `@shared/i18n`.
- **Runtime config** — `runtimeStore` / `getConfig` from `@shared/config`.
- **Badge counts** — `adminBadges` / `useBadge` / `useBadgeSum` from `@/stores/badgeStore`. Covered by `admin-badge` + existing implementation.

## Concept

The starter's shared-state primitive is `createStore<T>(initialState)` from `@shared/store`. It wraps React's `useSyncExternalStore` to give every subscriber reactive updates without Context providers. Pattern:

1. Create the store with initial state.
2. Export an **imperative API** (named object) for mutations: `hydrate`, `set`, `reset`, domain-specific verbs.
3. Export **selector hooks**: `useX(key?)`, `useXSum(keys?)` — narrow subscriptions that only re-render when the selected slice changes.

This pattern is already exercised by:

- `adminBadges` + `useBadge` / `useBadgeSum` / `useBadgeCounts` (frontend/admin/src/stores/badgeStore.ts — admin-badge skill)
- `runtimeStore` + `getConfig` (@shared/config — framework-wired, populated by SPA bootstrap)
- `localeStore` + `useLocale` (@shared/i18n — cookie-backed)
- `auth` (per-portal, via `createAuth` which wraps `createStore` internally)

Each store owns one concern; they don't fan out.

## Prerequisites

- [ ] The state genuinely needs sharing across multiple components, OR persists across route changes.
- [ ] The placement decision (portal-local vs shared) is clear — see Decision 1.

## Decisions — quick

### 1. Placement

- **Portal-local** — used only inside one portal's code → `frontend/<portal>/src/stores/<name>Store.ts`. Most stores. Example: `adminBadges`.
- **Shared** — imported by multiple portals (admin + user + future portals) → `frontend/shared/<name>/index.ts` (or `frontend/shared/<name>/store.ts` if the folder grows). Examples: `runtimeStore`, `localeStore`. Rare — most app state is portal-specific.

### 2. State shape

The `T` type in `createStore<T>(initial)`. Keep it flat where possible (single level of keys); nested state is fine but harder to selector over. If a slice of the state makes sense as its own store, prefer two focused stores over one mega-store.

### 3. API surface

- **Hydrate** — set from an initial source (API snapshot, cookie, SPA bootstrap).
- **Set / update** — mutate specific fields.
- **Reset** — return to initial state (typically on logout or navigation away).
- **Domain verbs** — instead of exposing raw `setState`, name the operation (`adminBadges.set(key, count)` is clearer than `badgeStore.setState({...})`).

### 4. Selector hooks

- `useX()` — returns the whole state (last resort; re-renders on any change).
- `useX(key)` — returns one field (re-renders only when that field changes).
- `useXFor(...)`, `useXSum(keys)`, `useXMap(keys)` — specialized selectors for common consumption patterns.

Rule: keep selectors narrow. A component that only reads `counts["work.pending_topups"]` shouldn't re-render when `counts["work.pending_kyc"]` changes.

### 5. Lifecycle

- **On mount** — who hydrates? Typical: `App.tsx` on auth change fetches an API snapshot + calls `store.hydrate(...)`.
- **On reset** — who clears? Typical: `App.tsx` on logout calls `store.reset()`.
- **On reconnect** — if state depends on real-time (WebSocket), refetch on reconnect.

## Steps

### 1. Create the store file

Path: `frontend/<portal>/src/stores/<name>Store.ts` (or `frontend/shared/<name>/index.ts` for shared).

```ts
import { createStore, useStore } from "@shared/store";

type <Name>State = {
    <field_1>: <Type>;
    <field_2>: <Type>;
    loaded: boolean;           // optional but common — track whether hydrated
};

const <name>Store = createStore<<Name>State>({
    <field_1>: <initial>,
    <field_2>: <initial>,
    loaded: false,
});

export const <name> = {
    /** Replace state from an authoritative source (API snapshot, SPA bootstrap). */
    hydrate(next: Partial<<Name>State>) {
        <name>Store.setState({ ...next, loaded: true });
    },

    /** Update one field (typical WS-delta / user-action handler). */
    set<Verb>(<arg>: <Type>) {
        <name>Store.setState((prev) => ({
            <field_1>: <compute from prev + arg>,
        }));
    },

    /** Whether hydration has happened (optional — many stores don't need this). */
    knows(key: string): boolean {
        return key in <name>Store.getState().<field>;
    },

    /** Return to initial state (on logout / unmount). */
    reset() {
        <name>Store.setState({
            <field_1>: <initial>,
            <field_2>: <initial>,
            loaded: false,
        });
    },
};

// Narrow selector hooks — each re-renders only when its slice changes.

/** Full state access (use sparingly — re-renders on any change). */
export function use<Name>(): <Name>State {
    return useStore(<name>Store);
}

/** Single-field accessor — re-renders only when <field_1> changes. */
export function use<Name><Field>(): <Type> {
    return useStore(<name>Store, (s) => s.<field_1>);
}
```

### 2. Wire lifecycle (hydrate + reset)

In the portal's `App.tsx` (inside the `auth.onAuthChange` callback, matching the pattern used by `adminBadges`):

```tsx
return auth.onAuthChange(async (user) => {
    if (!user) {
        <name>.reset();
        ws.disconnect();
        return;
    }

    // ... existing setup ...

    try {
        const { data } = await api.get<<Response>>("/<endpoint>");
        <name>.hydrate({ <field_1>: data.<field> });
    } catch {
        <name>.hydrate({});
    }
});
```

If the store doesn't need server-side hydration (purely client-tracked state like "sidebar collapsed"), skip the API call — initial state serves as default.

### 3. Consume from components

```tsx
import { use<Name><Field>, <name> } from "@/stores/<name>Store";

function SomeComponent() {
    const value = use<Name><Field>();                 // narrow subscription
    return <div>{value}</div>;
}

function SomeHandler() {
    const onClick = () => <name>.set<Verb>(<arg>);    // imperative mutation
    // ...
}
```

## Common patterns

### Hydrate from API + subscribe to WS deltas

Pattern used by `adminBadges`. Hydrate once on login, then subscribe to a WS channel and apply deltas:

```tsx
try {
    const { data } = await api.get<<Snapshot>>("/snapshot");
    <name>.hydrate(data);
} catch {
    <name>.hydrate({});
}

ws.subscribe("<channel>");
ws.on("<channel>", "<event>", (payload) => {
    if (!<name>.knows(payload.key)) return;          // allowlist filter
    <name>.set<Verb>(payload.key, payload.value);
});
```

### Persist to cookie / localStorage

For preferences that should survive reload:

```ts
const STORAGE_KEY = "<portal>_<name>";

const initial = (() => {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") ?? DEFAULT_STATE;
    } catch {
        return DEFAULT_STATE;
    }
})();

const <name>Store = createStore<<Name>State>(initial);

// Wrap every setState with a persist:
export const <name> = {
    set<Verb>(<args>) {
        <name>Store.setState((prev) => {
            const next = { ...prev, /* compute */ };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            return next;
        });
    },
};
```

Prefer the cookie-based `localeStore` precedent from `@shared/i18n` if the state must be readable server-side (e.g., for SSR-level locale). For purely client state, `localStorage` is fine.

### Computed selector

When a component needs a derived value, compute it in the selector:

```ts
export function useVisibleBadgeCount(permittedKeys: string[]): number {
    return useStore(<name>Store, (s) =>
        permittedKeys.reduce((acc, key) => acc + (s.counts[key] ?? 0), 0),
    );
}
```

React's `useSyncExternalStore` only re-renders when the selector's return value changes (referential equality). Return primitives / stable references where possible.

### Multiple stores for complex state

If one feature has genuinely independent state slices (filters + table data + modal state), split into multiple stores. Keeps selectors tight and mutations targeted. Consuming a slice unrelated to your subscription won't re-render you.

## Verify

```bash
make lint
make types
```

Then manual smoke:
1. Open a consuming component; state reads correctly.
2. Trigger an imperative setter elsewhere; the consuming component re-renders with the new value.
3. Log out; store resets to initial.

## Don't

- **Don't use a store for form state.** `useForm` from `@shared/hooks` handles value / error / dirty / busy tracking. See `frontend-form`.
- **Don't use a store for component-local state.** `useState` is fine for single-component concerns; promoting to a store adds overhead without benefit.
- **Don't mutate the state object directly.** Always go through `setState` (either the raw `setState` or a wrapping imperative method). Direct mutation bypasses subscriber notification — components won't re-render.
- **Don't export the raw `store` object publicly.** Export the imperative API (`<name>`) + selector hooks. Callers never touch `store.setState` directly — they use domain verbs. Keeps the mutation surface auditable.
- **Don't put side effects (API calls, toasts, navigation) in setters.** The store is pure state. Side effects belong in the caller (usually in a service layer of the frontend — a handler in App.tsx, a hook that wraps both fetch + store write).
- **Don't share a store across portals without moving it to `frontend/shared/`.** Portal-local stores can't import each other. If admin and user both need the same state, promote the store to `frontend/shared/<name>/`.
- **Don't re-invent `auth` / `locale` / `runtime` / `badges` stores.** Those exist; reuse via `auth.useAuth()`, `useLocale`, `getConfig` / `runtimeStore`, `adminBadges`. New stores are for new domains, not parallels of existing ones.
- **Don't over-normalize the state shape.** A flat `Record<string, T>` is easier to selector than nested trees. Complex nesting tends to indicate two stores want to be split out.
- **Don't forget `reset()` on logout.** User-scoped state (badges, cart, filters) must clear when auth changes, or the next user sees the previous user's data.

## When this skill doesn't fit

- **Form state** → `frontend-form` (always `useForm`).
- **Server state with no cross-component sharing** → `useEffect` + `useState` in-place is fine.
- **Auth / locale / runtime** → use the existing stores; don't add parallels.
- **Adding a field to an existing store** → edit the existing `<name>Store.ts` + matching hook; no skill needed.
- **Cross-portal shared primitive** → the `frontend/shared/` tree; still use this skill but put the file under shared.
