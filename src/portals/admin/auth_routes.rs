use forge::prelude::*;
use crate::domain::services::auth_service;
use crate::portals::admin::requests::AdminLoginRequest;

pub async fn login(
    State(app): State<AppContext>,
    Validated(req): Validated<AdminLoginRequest>,
) -> Result<Response> {
    let (session_id, _admin) = auth_service::login_with_session(&app, &req.email, &req.password).await?;
    let sessions = app.sessions()?;
    sessions.login_response(session_id, Json(serde_json::json!({ "message": "logged in" })))
}

pub async fn logout(
    State(app): State<AppContext>,
    CurrentActor(actor): CurrentActor,
) -> Result<Response> {
    let sessions = app.sessions()?;
    sessions.destroy_all::<crate::domain::models::Admin>(&actor.id).await?;
    sessions.logout_response(Json(serde_json::json!({ "message": "logged out" })))
}
