---
name: new-channel
description: Use when adding a new WebSocket channel beyond the existing `admin:presence` (admin connection tracking) and `admin:badges` (badge counts pushed by the badge system). Typical phrasings: "add a WS channel for live chat", "real-time presence for user portal", "push live order status updates", "broadcast a typing indicator", "channel for a collaborative editor", "public channel for stock ticker", "admin-only channel for live moderation log". Covers the `ChannelId` + `ChannelEventId` constants in `src/ids/channels.rs`, `WebSocketRegistrar::channel_with_options` in `src/realtime/mod.rs`, the public-vs-guarded decision, presence tracking, broadcast-only vs bidirectional handler shapes, per-user / per-room channel parameterization, and frontend subscription + publish via `@shared/websocket`. Do NOT use for: badge counts (→ `admin-badge` has its own channel pattern pre-wired); Forge's user-facing `notifications` channel (pre-wired; covered in `jobs-and-notifications` Broadcast channel); dispatching work via jobs (→ `jobs-and-notifications`); REST routes (→ `new-route`); auth / token exchange (part of each portal's `/auth/ws-token` route — scaffolded by `new-portal`).
---

# New Channel — add a custom WebSocket channel

## When to invoke

A developer needs real-time bidirectional (or broadcast-only) communication between the backend and connected clients beyond what exists. Typical phrasings:

- "live chat channel"
- "real-time order status updates to the user who placed it"
- "typing indicator for a chat interface"
- "collaborative editor sync"
- "public stock ticker broadcast"
- "admin moderation queue with real-time updates"
- "per-document collaboration channel"

Do NOT invoke for:
- **Badge counts** — `admin-badge` owns the `admin:badges` channel. Adding a new count badge is a badge skill concern, not a channel skill concern.
- **Forge's notifications broadcast channel** — `notifications:{notifiable_id}` is pre-wired by the `NOTIFY_BROADCAST` channel when you dispatch a notification with that channel. Covered by `jobs-and-notifications`.
- **Dispatching async work** — jobs / schedules handle background work; WS channels are for real-time client comms.
- **Custom REST route** — `new-route`. A webhook receiver is a REST route (`POST /webhooks/...`), not a WS channel.
- **Auth / token exchange** — every portal's `/auth/ws-token` endpoint is scaffolded by `new-portal`. You don't rebuild the token-issuing infrastructure per channel.

## Concept

Forge's WebSocket runs on a dedicated process (port 3010 by default, started by `make dev`). Channels are registered at bootstrap via `WebSocketRegistrar::channel_with_options(ChannelId, handler, WebSocketChannelOptions)`. Connected clients subscribe to channels by name; the backend publishes events via `app.websocket()?.publish(channel_id, event_id, room, payload)`.

The starter's `src/realtime/mod.rs` already registers three channels:

```rust
registrar.channel_with_options(
    ids::channels::NOTIFICATIONS,                           // forge notifications broadcast
    |context, payload| async move {
        context.publish(ids::channels::NOTIFICATION_EVENT, payload).await
    },
    WebSocketChannelOptions::new().guard(ids::guards::Guard::User),
)?;

registrar.channel_with_options(
    ids::channels::ADMIN_PRESENCE,                          // admin connection tracking
    |_ctx, _payload| async move { Ok(()) },
    WebSocketChannelOptions::new()
        .guard(ids::guards::Guard::Admin)
        .presence(true),
)?;

registrar.channel_with_options(
    ids::channels::ADMIN_BADGES,                            // badge push path
    |_ctx, _payload| async move { Ok(()) },
    WebSocketChannelOptions::new().guard(ids::guards::Guard::Admin),
)?;
```

Your channel lives alongside these. The three decisions below shape the registration + handler.

**Publishing (cross-process safe):** `app.websocket()?.publish(channel, event, room: Option<&str>, payload: impl Serialize).await?`. Works from any process (HTTP, Worker, Scheduler, WS). Redis-backed under the hood — the badge system relies on this.

**Frontend subscription (per-portal):** `ws.subscribe("<channel>")` + `ws.on("<channel>", "<event>", handler)`. See `frontend/admin/src/websocket.ts` for the admin-portal instance; user portal has its own.

## Prerequisites

- [ ] The work is genuinely real-time / bidirectional. For once-per-request data, use REST.
- [ ] The portal(s) that will consume the channel exist (auth wiring + `ws` instance).
- [ ] If the channel is guarded, the matching `Guard` variant exists (`new-portal` adds guards when a portal is created).

## Decisions — answer ALL before writing code

### 1. Channel name

Convention: `<scope>:<purpose>` or `<scope>:<purpose>:<id>`.

- `public:*` — no auth (stock ticker, public leaderboard). Very rare.
- `admin:*` — admin-authenticated only. Example: `admin:presence`, `admin:badges`.
- `user:*` — user-authenticated only.
- `<scope>:<purpose>:{id}` — per-user / per-resource room pattern (e.g., `chat:{room_id}`, `document:{doc_id}`). The `{id}` is appended at subscribe time from the frontend; the channel ID const covers only the prefix.

Name is stable — treat as contract between backend and every frontend consumer.

### 2. Auth + who can subscribe

- `.public()` — anyone can subscribe. Used for truly public broadcasts (stock ticker, public activity feed). Default: no.
- `.guard(Guard::<Actor>)` — authenticated as that actor type. Default for most app channels.
- `.guard(Guard::<Actor>)` plus a **handler-level authorization check** that rejects subscribers lacking specific permissions. Example: `admin:moderation` channel gates on `moderation.view` permission inside the handler.
- Per-user channels — combine a parameterized channel name (`user:messages:{user_id}`) with a handler check that `context.actor().id() == expected_id`. Prevents one user from snooping on another's channel.

### 3. Presence tracking

`WebSocketChannelOptions::new().presence(true)` — Forge tracks which actors are currently connected. Other subscribers receive presence-join / presence-leave events. Use for:
- Showing "who's online" in an admin dashboard
- Collaborative editor avatars
- Chat online status

Omit for channels where identity of connected clients doesn't matter (broadcast-only streams).

### 4. Broadcast-only vs bidirectional

- **Broadcast-only** (handler is a no-op) — server pushes to subscribers; clients never publish. `admin:badges` is broadcast-only. Handler: `|_ctx, _payload| async move { Ok(()) }`.
- **Bidirectional** (handler processes published messages from clients) — clients publish via `ws.send("<channel>", "<event>", payload)` and the handler reacts. Chat is bidirectional. Handler example:
  ```rust
  |context, payload: serde_json::Value| async move {
      // validate payload, persist message, broadcast back to all subscribers
      context.publish(ids::channels::CHAT_MESSAGE, payload).await
  }
  ```

### 5. Event vocabulary

Each channel has a set of event names (the second argument to `publish` and `on`). Declare them as `ChannelEventId` constants alongside the channel ID. Examples:

- `admin:badges` uses `badge:updated` events
- A chat channel might use `message`, `typing`, `message:deleted`
- An order-status channel might use `status:changed`, `shipped`, `delivered`

### 6. Payload shape

Payloads are JSON (`serde_json::Value` on the wire). Typed shapes are encouraged: define a struct in the portal's `responses/<resource>.rs` with `#[derive(Serialize, ts_rs::TS, forge::ApiSchema)]` + `#[ts(export)]` so frontend consumers get typed payload.

## Steps

### 1. Add the channel + event constants

Edit `src/ids/channels.rs`:

```rust
use forge::prelude::*;

pub const NOTIFICATIONS: ChannelId = ChannelId::new("notifications");
pub const NOTIFICATION_EVENT: ChannelEventId = ChannelEventId::new("notification");
pub const ADMIN_PRESENCE: ChannelId = ChannelId::new("admin:presence");
pub const ADMIN_BADGES: ChannelId = ChannelId::new("admin:badges");
pub const BADGE_UPDATED: ChannelEventId = ChannelEventId::new("badge:updated");

// New:
pub const <YOUR_CHANNEL>: ChannelId = ChannelId::new("<scope>:<purpose>");
pub const <YOUR_EVENT>: ChannelEventId = ChannelEventId::new("<event:name>");
// Add more event constants if the channel has multiple event types
```

For parameterized channels (per-user rooms), declare only the prefix; the suffix is appended at subscribe time:

```rust
pub const CHAT_ROOM_PREFIX: &str = "chat:room:";
// Frontend subscribes via: ws.subscribe(`chat:room:${roomId}`)
// Backend registers at the prefix and routes per-room in the handler.
```

### 2. Register the channel

Edit `src/realtime/mod.rs`. Add inside the `register` function, following the existing patterns:

**Broadcast-only, admin-authenticated:**

```rust
registrar.channel_with_options(
    ids::channels::<YOUR_CHANNEL>,
    |_context: WebSocketContext, _payload: serde_json::Value| async move { Ok(()) },
    WebSocketChannelOptions::new().guard(ids::guards::Guard::Admin),
)?;
```

**Bidirectional, user-authenticated:**

```rust
registrar.channel_with_options(
    ids::channels::<YOUR_CHANNEL>,
    |context: WebSocketContext, payload: serde_json::Value| async move {
        // Process incoming message. Typically:
        //   1. Validate payload shape
        //   2. Call a service to persist / trigger side effects
        //   3. Optionally publish back to the channel
        crate::domain::services::<service>::handle_ws_message(context.app(), &payload).await?;
        context.publish(ids::channels::<YOUR_EVENT>, payload).await
    },
    WebSocketChannelOptions::new().guard(ids::guards::Guard::User),
)?;
```

**With presence tracking:**

```rust
registrar.channel_with_options(
    ids::channels::<YOUR_CHANNEL>,
    |_context, _payload| async move { Ok(()) },
    WebSocketChannelOptions::new()
        .guard(ids::guards::Guard::Admin)
        .presence(true),
)?;
```

**Public (unauthenticated):**

```rust
registrar.channel_with_options(
    ids::channels::<YOUR_CHANNEL>,
    |_context, _payload| async move { Ok(()) },
    WebSocketChannelOptions::new().public(),
)?;
```

### 3. Publish from backend code

From a service / handler / job / schedule / event listener that holds an `AppContext`:

```rust
let publisher = app.websocket()?;
publisher
    .publish(
        ids::channels::<YOUR_CHANNEL>,
        ids::channels::<YOUR_EVENT>,
        None,                                        // or Some("room-id") for room-scoped
        serde_json::json!({ "field_1": "value" }),
    )
    .await?;
```

For per-user rooms, parameterize the channel name:

```rust
publisher
    .publish(
        ChannelId::new(&format!("user:messages:{}", user.id)),
        ids::channels::<YOUR_EVENT>,
        None,
        payload,
    )
    .await?;
```

Channel IDs can be constructed at runtime from the prefix; the backend handler registers against the prefix pattern (Forge matches subscribers against registered channels).

### 4. Frontend subscribe + listen

In `frontend/<portal>/src/App.tsx` or a page-level hook:

```tsx
ws.subscribe("<scope>:<purpose>");

ws.on("<scope>:<purpose>", "<event:name>", (payload) => {
    // Handle incoming event. Update a store, show a toast, etc.
    // payload is typed by the backend DTO if you exported one via ts_rs.
    console.log("received:", payload);
});
```

Per-user / per-room subscription:

```tsx
ws.subscribe(`chat:room:${roomId}`);
ws.on(`chat:room:${roomId}`, "message", (payload) => { /* ... */ });
```

Cleanup on unmount:

```tsx
useEffect(() => {
    ws.subscribe(channelName);
    const off = ws.on(channelName, "event", handler);
    return () => {
        off();                    // unregister listener
        ws.unsubscribe(channelName);
    };
}, [channelName]);
```

### 5. Publish from frontend (bidirectional only)

If the channel is bidirectional:

```tsx
ws.send("<scope>:<purpose>", "<event>", { text: "hello" });
```

The backend handler receives this as the `payload` argument. The handler decides what to do — persist, re-broadcast, validate + error, etc.

## Verify

```bash
make check
make lint
```

**Smoke test** (`make dev`):

1. Open a browser with dev tools on the relevant portal. Authenticate.
2. In the browser console: `ws.subscribe("<your:channel>")` — verify a subscription message shows in the WS process logs.
3. From a backend path (service / route / CLI), `app.websocket()?.publish(...).await?`. Verify the frontend receives it.
4. For bidirectional: call `ws.send(...)` from the browser, verify the handler runs.

## Don't

- **Don't use WebSocket for request/response.** If the client asks once and expects a reply, use REST. WebSocket is for streaming / push.
- **Don't omit authentication.** `.public()` channels bleed data. Default to `.guard(Guard::X)` for every app channel.
- **Don't skip per-user authorization on rooms.** A channel named `user:messages:{user_id}` must enforce `context.actor().id() == user_id` in the handler (or at subscribe-time authorization), or any authenticated user can snoop another user's messages.
- **Don't publish unstructured payloads.** Define a typed struct for each event payload; the frontend gets compile-time safety via generated TS.
- **Don't put business logic in the handler.** The handler is glue — validate payload, call a service, publish. Services own behavior, per CLAUDE.md "thin portals, fat services" (same rule applies to WS handlers).
- **Don't reuse the same `ChannelId` with two different shapes / guards.** One ID = one contract. Duplicating risks confusing subscribers.
- **Don't forget to `unsubscribe` on component unmount.** Leaked subscriptions inflate WS server memory over long sessions; disciplined cleanup in `useEffect` returns is mandatory.
- **Don't try to persist state in the WS process.** WS handlers are stateless per request; use the database or a resolved singleton if long-lived state matters.
- **Don't use presence tracking for things that don't need it.** Presence costs Redis memory + event traffic per connect/disconnect. Only enable where you actually render "who's online".
- **Don't mix REST auth tokens with WebSocket.** Frontend WS tokens come from the portal's `/auth/ws-token` endpoint (short-lived, per-connection), not from the long-lived REST token. See `frontend/<portal>/src/websocket.ts`'s `getToken` callback.

## When this skill doesn't fit

- **Badge counts** → `admin-badge` (owns `admin:badges`; sidebar count pattern pre-wired).
- **User notification inbox** → `jobs-and-notifications`'s `NOTIFY_BROADCAST` channel — pre-wired, just include in your notification's `via()`.
- **Dispatching async work** → `jobs-and-notifications`.
- **Recurring / scheduled work** → `new-schedule`.
- **Reactive work on model save** → `new-event-listener`.
- **REST endpoint** → `new-route`.
- **Auth / token issuance** → `new-portal` scaffolds `/auth/ws-token`; each portal re-uses its portal-specific token exchange.
- **Adding a sub-channel pattern to an existing channel** — just publish / subscribe to the extended name; no new registration needed if the prefix matches.
