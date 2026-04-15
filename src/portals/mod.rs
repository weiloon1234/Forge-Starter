use forge::prelude::*;

pub mod admin;
pub mod spa;
pub mod user;

/// Register all API routes.
pub fn register(r: &mut HttpRegistrar) -> Result<()> {
    r.route("/health", get(health));
    admin::register(r)?;
    user::register(r)?;
    Ok(())
}

/// Register SPA handlers — serves dynamic HTML per portal.
/// Dev: loads from Vite dev server (hot reload). Prod: serves built assets.
pub fn register_spa(r: &mut HttpRegistrar) -> Result<()> {
    use tower_http::services::ServeDir;

    // Admin portal: SPA handler + static assets
    r.route("/admin", get(spa::admin_spa));
    r.route("/admin/{*path}", get(spa::admin_spa));
    let admin_assets = Router::<AppContext>::new()
        .nest_service("/admin/assets", ServeDir::new("public/admin/assets"));
    r.merge(admin_assets);

    // User portal: SPA handler as fallback + static assets
    let user_assets = Router::<AppContext>::new()
        .nest_service("/assets", ServeDir::new("public/user/assets"));
    r.merge(user_assets);

    Ok(())
}

async fn health() -> impl IntoResponse {
    Json(serde_json::json!({ "status": "ok" }))
}
