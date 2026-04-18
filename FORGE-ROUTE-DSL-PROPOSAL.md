# Forge Route DSL Proposal

This document proposes a higher-level route DSL for Forge that keeps the current power and explicitness, but removes repetitive route boilerplate in real apps.

The target is simple:

- shortest correct code
- fewer chances for route drift
- inherited group defaults for path prefix, route name prefix, OpenAPI tag, guard, and common docs
- explicit route-level overrides when needed

This proposal is based on the current starter route files, especially:

- [src/portals/admin/mod.rs](/Users/weiloon/Projects/personal/Rust/Forge-Starter/src/portals/admin/mod.rs)
- [src/portals/user/mod.rs](/Users/weiloon/Projects/personal/Rust/Forge-Starter/src/portals/user/mod.rs)

## Problem

The current Forge route API is flexible, but large route files repeat the same information over and over:

- path prefix
- route name prefix
- OpenAPI tag
- guard
- `HttpRouteOptions::new().document(...)`
- `RouteDoc::new().get()/post()/put()...`

That repetition creates three problems:

1. The code is longer than the intent.
2. It is easy for one route to forget a guard, tag, or permission.
3. Runtime behavior and docs can drift because the same metadata is restated many times.

## Design Goals

The DSL should optimize for these principles:

1. Method and access control are separate concerns.
2. Group-level defaults should be inherited automatically.
3. Route-level behavior should stay explicit and easy to override.
4. OpenAPI metadata should live in the same fluent shape as route registration.
5. Relative route names should compose into full names automatically.
6. The common path should be very short, but uncommon cases must still be possible.

## Important Shape Rules

These are the rules I would want Forge to enforce.

### 1. Keep HTTP verbs simple

Good:

```rust
scope.get(...)
scope.post(...)
scope.put(...)
scope.delete(...)
```

Not ideal:

```rust
scope.public_post(...)
scope.protected_get(...)
```

The access rule should be attached separately with `.public()`, `.guard(...)`, `.permission(...)`, and optionally `.guest()`.

### 2. Group defaults should inherit

A scope should be able to define defaults once:

- path prefix
- route name prefix
- OpenAPI tag
- guard
- permission

Nested scopes should inherit those defaults unless explicitly overridden.

### 3. Route names should be relative

Inside an `admin.auth` scope, this:

```rust
auth.post("/login", "login", handler, ...)
```

should produce:

```text
admin.auth.login
```

without requiring the caller to restate the full route name every time.

### 4. OpenAPI tag should usually be group-level

Most modules use one tag per section:

- `admin:auth`
- `admin:profile`
- `admin:users`
- `user:profile`

That should be a scope default, not repeated on every route.

### 5. Guard should usually be group-level

For most route groups, nearly every route shares the same guard.

Example:

- `/admin/profile/*` is guarded by `Guard::Admin`
- `/user/me` is guarded by `Guard::User`

That should be declared once and inherited.

## Current Starter Shape

Today the admin routes in [src/portals/admin/mod.rs](/Users/weiloon/Projects/personal/Rust/Forge-Starter/src/portals/admin/mod.rs) look like this:

```rust
r.route_named_with_options(
    "admin.profile.update",
    "/profile",
    put(profile_routes::update_profile),
    HttpRouteOptions::new().guard(Guard::Admin).document(
        RouteDoc::new()
            .put()
            .summary("Update admin profile")
            .tag("admin:profile")
            .request::<UpdateAdminProfileRequest>()
            .response::<AdminMeResponse>(200),
    ),
);

r.route_named_with_options(
    "admin.profile.locale",
    "/profile/locale",
    put(profile_routes::update_locale),
    HttpRouteOptions::new().guard(Guard::Admin).document(
        RouteDoc::new()
            .put()
            .summary("Update admin locale preference")
            .tag("admin:profile")
            .request::<UpdateAdminLocaleRequest>()
            .response::<MessageResponse>(200),
    ),
);
```

This is explicit, but the route intent is buried inside repeated framework ceremony.

## Proposed Minimal DSL

The smallest useful Forge improvement would be:

- `scope(path, |scope| ...)`
- scope defaults for `name_prefix`, `tag`, `guard`, and optionally `permission`
- simple verb helpers: `get/post/put/delete`
- route-level doc builder integrated into the same call

Example:

```rust
r.api_version(1, |r| {
    r.scope("/admin", |admin| {
        admin
            .name_prefix("admin");

        admin.scope("/profile", |profile| {
            profile
                .name_prefix("profile")
                .tag("admin:profile")
                .guard(Guard::Admin);

            profile.put("", "update", profile_routes::update_profile, |route| {
                route
                    .summary("Update admin profile")
                    .request::<UpdateAdminProfileRequest>()
                    .response::<AdminMeResponse>(200)
            });

            profile.put("/locale", "locale", profile_routes::update_locale, |route| {
                route
                    .summary("Update admin locale preference")
                    .request::<UpdateAdminLocaleRequest>()
                    .response::<MessageResponse>(200)
            });

            profile.put("/password", "change_password", profile_routes::change_password, |route| {
                route
                    .summary("Change admin password")
                    .request::<ChangeAdminPasswordRequest>()
                    .response::<MessageResponse>(200)
            });

            Ok(())
        })?;

        Ok(())
    })?;

    Ok(())
})?;
```

This already removes most of the repeated pieces while staying explicit.

## Ideal End-State DSL

My ideal shape would go one step further and make route groups feel like modules.

Example for admin auth:

```rust
r.api_version(1, |r| {
    r.scope("/admin", |admin| {
        admin.name_prefix("admin");

        admin.scope("/auth", |auth| {
            auth
                .name_prefix("auth")
                .tag("admin:auth");

            auth.post("/login", "login", auth_routes::login, |route| {
                route
                    .public()
                    .summary("Admin login (token)")
                    .request::<AdminLoginRequest>()
                    .response::<TokenPair>(200)
            });

            auth.post("/refresh", "refresh", auth_routes::refresh, |route| {
                route
                    .public()
                    .summary("Refresh admin access token")
                    .request::<RefreshTokenRequest>()
                    .response::<TokenPair>(200)
            });

            auth.post("/logout", "logout", auth_routes::logout, |route| {
                route
                    .guard(Guard::Admin)
                    .summary("Admin logout")
                    .response::<MessageResponse>(200)
            });

            auth.post("/ws-token", "ws_token", auth_routes::ws_token, |route| {
                route
                    .guard(Guard::Admin)
                    .summary("Get short-lived WebSocket token")
                    .response::<WsTokenResponse>(200)
            });

            auth.get("/me", "me", auth_routes::me, |route| {
                route
                    .guard(Guard::Admin)
                    .summary("Get authenticated admin profile")
                    .response::<AdminMeResponse>(200)
            });

            Ok(())
        })?;

        Ok(())
    })?;

    Ok(())
})?;
```

This shape is short, readable, and still explicit.

## Why This Shape Is Better

The ideal DSL improves DX in a few real ways.

### Shorter code

The route file becomes mostly business intent:

- path
- name
- access
- summary
- request
- response

instead of framework scaffolding.

### Safer defaults

If a section is guarded, tagged, and name-prefixed at the group level, fewer routes can accidentally drift from the module convention.

### Easier scanning

A route file reads like:

- admin auth
- admin profile
- admin users
- admin countries

instead of a long flat sequence of `route_named_with_options(...)` calls.

### Better module onboarding

A teammate adding a new route only needs to think about what is unique, not restate all shared metadata every time.

## Access Model

Access should stay explicit and composable.

Preferred shape:

```rust
route.public()
route.guard(Guard::Admin)
route.permission(Permission::UsersManage)
route.guest()
```

Notes:

- `public()` means anyone can access it.
- `guard(...)` means authenticated under that guard.
- `permission(...)` adds authorization requirements.
- `guest()` should be optional and only mean unauthenticated-only. It is not the same as `public()`.

I would avoid introducing helpers like `public_post(...)` because they mix unrelated concerns into the method name.

## OpenAPI Model

OpenAPI metadata should compose the same way as runtime metadata.

The group should be able to define:

- default tag
- maybe common summary prefix in the future

The route should define:

- summary
- request type
- response type(s)
- special docs overrides if needed

Example:

```rust
profile
    .tag("admin:profile")
    .guard(Guard::Admin);

profile.put("/locale", "locale", handler, |route| {
    route
        .summary("Update admin locale preference")
        .request::<UpdateAdminLocaleRequest>()
        .response::<MessageResponse>(200)
});
```

That is much closer to how people think about route design.

## Resource Flavor

After the base scope DSL exists, Forge could add a resource-style helper for the common CRUD path.

Example:

```rust
admin.resource("/users", "users", |users| {
    users
        .guard(Guard::Admin)
        .tag("admin:users")
        .permission(Permission::UsersManage);

    users.index(user_routes::index, |route| {
        route.summary("List users")
    });

    users.show("/{id}", user_routes::show, |route| {
        route
            .summary("Get user by ID")
            .response::<AdminUserResponse>(200)
    });

    Ok(())
})?;
```

This should be optional sugar built on top of the lower-level scope DSL, not a replacement for it.

## Inheritance Rules

To keep this predictable, I would want simple inheritance rules.

- `path_prefix`: concatenates
- `name_prefix`: dot-concatenates
- `tag`: inherited by default, route may override
- `guard`: inherited by default, route may override or call `public()`
- `permission`: inherited by default, route may add another permission or replace if needed

The key principle is that inheritance should reduce repetition without becoming magical.

## Non-Goals

This DSL should not try to:

- hide route names completely
- infer HTTP docs from handler signatures only
- replace the low-level route API for advanced cases
- force CRUD/resource conventions on every module

Forge should keep the current low-level API available.

## Suggested Forge API Surface

If I had to name the minimum useful primitives, they would be:

```rust
scope(path, |scope| ...)
scope.name_prefix(...)
scope.tag(...)
scope.guard(...)
scope.permission(...)

scope.get(path, name, handler, |route| ...)
scope.post(path, name, handler, |route| ...)
scope.put(path, name, handler, |route| ...)
scope.delete(path, name, handler, |route| ...)

route.public()
route.guest()
route.guard(...)
route.permission(...)
route.summary(...)
route.request::<T>()
route.response::<T>(status)
```

That is enough to remove most starter boilerplate while still staying unsurprising.

## Best First Step

If Forge wants the smallest safe first version, I would ship only this:

1. `scope(...)`
2. inherited `name_prefix`, `tag`, `guard`
3. `get/post/put/delete`
4. route builder with `summary/request/response`

That alone would already simplify the starter substantially.

## Final Recommendation

The right Forge route DSL is not about adding fancy abstractions. It is about making the common, correct, documented route shape the shortest thing to write.

That means:

- group prefix once
- route name prefix once
- OpenAPI tag once
- guard once
- short route declarations
- explicit overrides only when truly needed

That is the ergonomics win worth building.
