## Route Rules

Routes live in `portals/{portal}/mod.rs` using Forge's scope DSL. Group defaults (`name_prefix`, `tag`, `guard`, `permission`) cascade to routes inside the scope; individual routes can override with their own `.guard()`, `.permission()`, or `.public()`.

```rust
r.api_version(1, |r| {
    r.scope("/admin", |admin| {
        admin.name_prefix("admin");

        admin.scope("/users", |users| {
            users
                .name_prefix("users")
                .tag("admin:users")
                .guard(Guard::Admin)
                .permission(Permission::UsersRead);

            users.get("", "index", user_routes::index, |route| {
                route.summary("List users (paginated)");
            });

            users.post("", "store", user_routes::store, |route| {
                route.permission(Permission::UsersManage);
                route.summary("Create user");
                route.request::<CreateUserRequest>();
                route.response::<UserResponse>(201);
            });

            Ok(())
        })?;

        Ok(())
    })?;
    Ok(())
})?;
```

Every route MUST have:

1. **Name** — second argument, relative. Scope composes: `{name_prefix}.{route_name}` → `admin.users.index`.
2. **Summary** — `route.summary("...")` — shows in OpenAPI docs.
3. **Request DTO** — `route.request::<T>()` on POST/PUT/PATCH routes (struct derives `ApiSchema`).
4. **Response DTO** — `route.response::<T>(status)` where the response shape is known.
5. **Access** — inherited from scope (`.guard(...)`, `.permission(...)`) or declared on the route (`.public()`, `.permission(...)`).

## Route Naming Convention

Format: `{portal}.{resource}.{action}` — produced automatically by scope composition.

- Scope `/admin` sets `name_prefix("admin")`
- Nested scope `/users` sets `name_prefix("users")`
- Route `users.get("", "index", ...)` → full name `admin.users.index`

Examples:

```
admin.auth.login
admin.auth.logout
admin.auth.me
admin.users.index
admin.users.show
admin.admins.store
admin.admins.update
admin.admins.destroy
admin.datatables.query
admin.datatables.download
user.auth.login
user.auth.refresh
user.me.show
user.me.update
```

## Tag Convention

Format: `{portal}:{resource}` — set once per scope with `.tag("admin:users")`.

```
admin:auth
admin:users
admin:datatables
user:auth
user:profile
```

## File Structure Per Portal

```
portals/{portal}/
├── mod.rs              # Route registration (api_version + nested scopes)
├── auth_routes.rs      # Auth handlers (login, logout, me)
├── {resource}_routes.rs  # Resource handlers (index, show, store, update, destroy)
├── requests.rs         # Request DTOs (Deserialize + RequestValidator + ApiSchema + TS)
├── responses.rs        # Response DTOs (Serialize + ApiSchema + TS)
├── resources.rs        # ApiResource impls (model → JSON transform)
├── datatables/         # Datatable classes per model
│   ├── mod.rs
│   └── {model}_datatable.rs
└── datatable_routes.rs # Generic datatable handlers (query, download)
```

## Request DTO Rules

Simple JSON DTOs should prefer `#[derive(Validate)]` together with `forge::ApiSchema` and `ts_rs::TS`:
```rust
#[derive(Debug, Deserialize, ts_rs::TS, forge::ApiSchema, Validate)]
#[ts(export)]
pub struct CreateUserRequest {
    #[validate(required, email)]
    pub email: String,
    #[validate(required, min(2))]
    pub name: String,
}
```

Use manual `impl RequestValidator` only when validation is runtime-driven, conditional, or depends on custom rule IDs:
```rust
#[async_trait]
impl RequestValidator for CreateUserRequest {
    async fn validate(&self, validator: &mut Validator) -> Result<()> {
        validator.field("email", &self.email).bail().required().email().apply().await?;
        validator.field("name", &self.name).bail().required().min(2).apply().await?;
        Ok(())
    }
}
```

## Response DTO Rules

Every response struct MUST derive:
```rust
#[derive(Serialize, ts_rs::TS, forge::ApiSchema)]
#[ts(export)]
pub struct UserResponse { ... }
```

## Handler Rules

Handlers are THIN — extract, validate, call service, return response. For JSON-only endpoints, use `JsonValidated<T>`:

```rust
pub async fn store(
    State(app): State<AppContext>,
    Auth(admin): Auth<Admin>,
    JsonValidated(req): JsonValidated<CreateUserRequest>,
) -> Result<impl IntoResponse> {
    let user = user_service::create(&app, &req).await?;
    Ok((StatusCode::CREATED, Json(UserResource::make(&user))))
}
```

No business logic in handlers. Services live in `domain/services/`.
