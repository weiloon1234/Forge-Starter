use forge::prelude::*;

pub mod admin;
pub mod user;

/// Register all API routes.
pub fn register(r: &mut HttpRegistrar) -> Result<()> {
    r.route("/health", get(health));
    admin::register(r)?;
    user::register(r)?;
    Ok(())
}

/// Register SPA static file serving for multi-portal frontends.
pub fn register_spa(r: &mut HttpRegistrar) -> Result<()> {
    use tower_http::services::{ServeDir, ServeFile};

    // Admin portal SPA — served under /admin, catches unmatched /admin/* paths.
    // nest_service on the underlying axum Router accepts any Service, avoiding
    // the Router<()> vs Router<AppContext> state mismatch.
    let admin_spa = ServeDir::new("public/admin")
        .fallback(ServeFile::new("public/admin/index.html"));
    let admin_router = Router::<AppContext>::new().nest_service("/admin", admin_spa);
    r.merge(admin_router);

    // User portal SPA is served via serve_spa("public/user") in bootstrap/http.rs
    // as the global fallback (catches all other unmatched routes)

    Ok(())
}

async fn health() -> impl IntoResponse {
    Json(serde_json::json!({ "status": "ok" }))
}
