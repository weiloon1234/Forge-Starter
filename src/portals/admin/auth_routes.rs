use forge::prelude::*;
use crate::domain::models::Admin;
use crate::domain::services::auth_service;
use crate::portals::admin::requests::AdminLoginRequest;
use crate::portals::admin::responses::AdminMeResponse;

pub async fn login(
    State(app): State<AppContext>,
    Validated(req): Validated<AdminLoginRequest>,
) -> Result<Response> {
    let (session_id, _admin) = auth_service::login_with_session(&app, &req.username, &req.password).await?;
    let sessions = app.sessions()?;
    sessions.login_response(session_id, Json(serde_json::json!({ "message": "logged in" })))
}

pub async fn logout(
    State(app): State<AppContext>,
    CurrentActor(actor): CurrentActor,
) -> Result<Response> {
    let sessions = app.sessions()?;
    sessions.destroy_all::<Admin>(&actor.id).await?;
    sessions.logout_response(Json(serde_json::json!({ "message": "logged out" })))
}

pub async fn me(
    State(_app): State<AppContext>,
    AuthenticatedModel(admin): Auth<Admin>,
) -> impl IntoResponse {
    Json(AdminMeResponse {
        id: admin.id.to_string(),
        username: admin.username.clone(),
        email: admin.email.clone(),
        name: admin.name.clone(),
        admin_type: admin.admin_type.clone(),
        locale: admin.locale.clone(),
    })
}
