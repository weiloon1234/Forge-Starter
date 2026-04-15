use forge::prelude::*;
use crate::domain::models::Admin;
use crate::domain::services::auth_service;
use crate::portals::admin::requests::{AdminLoginRequest, RefreshTokenRequest};
use crate::portals::admin::responses::AdminMeResponse;

pub async fn login(
    State(app): State<AppContext>,
    i18n: I18n,
    Validated(req): Validated<AdminLoginRequest>,
) -> Result<impl IntoResponse> {
    let tokens = auth_service::admin_login_with_token(&app, &i18n, &req.username, &req.password).await?;
    Ok(Json(tokens))
}

pub async fn refresh(
    State(app): State<AppContext>,
    Validated(req): Validated<RefreshTokenRequest>,
) -> Result<impl IntoResponse> {
    let tokens = app.tokens()?.refresh(&req.refresh_token).await?;
    Ok(Json(tokens))
}

pub async fn logout(
    State(app): State<AppContext>,
    CurrentActor(actor): CurrentActor,
) -> Result<impl IntoResponse> {
    app.tokens()?.revoke_all::<Admin>(&actor.id).await?;
    Ok(Json(serde_json::json!({ "message": "logged out" })))
}

pub async fn ws_token(
    State(app): State<AppContext>,
    AuthenticatedModel(admin): Auth<Admin>,
) -> Result<impl IntoResponse> {
    let tokens = admin.create_token_named(&app, "ws").await?;
    Ok(Json(serde_json::json!({ "token": tokens.access_token })))
}

pub async fn me(
    AuthenticatedModel(admin): Auth<Admin>,
) -> impl IntoResponse {
    Json(AdminMeResponse::from(&admin))
}
