## Route Rules

Every route MUST use `route_named_with_options` with:

1. **Named route** — `"{portal}.{resource}.{action}"` (e.g., `admin.users.index`)
2. **OpenAPI doc** — `.document(RouteDoc::new().{method}().summary("...").tag("..."))` on every route
3. **Request DTO** — `.request::<T>()` on POST/PUT/PATCH routes (the struct must derive `ApiSchema`)
4. **Response DTO** — `.response::<T>(status)` where the response shape is known
5. **Guard** — `.guard(Guard::Admin)` / `.guard(Guard::User)` on protected routes
6. **Permission** — `.permission(Permission::X)` where access control is needed

```rust
// Correct
r.route_named_with_options(
    "admin.users.index",
    "/users",
    get(user_routes::index),
    HttpRouteOptions::new()
        .guard(Guard::Admin)
        .permission(Permission::UsersManage)
        .document(RouteDoc::new()
            .get()
            .summary("List users (paginated)")
            .tag("admin:users")),
);

// WRONG — never do this
r.route("/users", get(user_routes::index));
```

## Route Naming Convention

Format: `{portal}.{resource}.{action}`

```
admin.auth.login
admin.auth.logout
admin.auth.me
admin.users.index
admin.users.show
admin.users.store
admin.users.update
admin.users.destroy
admin.datatables.query
admin.datatables.download
user.auth.login
user.auth.refresh
user.me.show
user.me.update
```

## Tag Convention

Format: `{portal}:{resource}`

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
├── mod.rs              # Route registration (api_version + group)
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
