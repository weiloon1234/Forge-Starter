use forge::prelude::*;

use crate::types::StatusResponse;

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

    // User portal: assets + fallback SPA. Any path not matched by an explicit
    // route, nested service, or another portal falls through to the user SPA.
    // `/api/*` and `/_forge/*` are excluded inside `user_spa_fallback` so
    // misses there return a real 404 instead of SPA HTML.
    let user_router = Router::<AppContext>::new()
        .nest_service("/assets", ServeDir::new("public/user/assets"))
        .fallback(spa::user_spa_fallback);
    r.merge(user_router);

    Ok(())
}

async fn health() -> impl IntoResponse {
    Json(StatusResponse::ok())
}
