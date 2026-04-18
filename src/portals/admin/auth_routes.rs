use crate::domain::models::Admin;
use crate::domain::services::admin_service;
use crate::domain::services::auth_service;
use crate::portals::admin::requests::AdminLoginRequest;
use crate::portals::admin::responses::AdminMeResponse;
use crate::validation::JsonValidated;
use forge::prelude::*;

pub async fn login(
    State(app): State<AppContext>,
    i18n: I18n,
    JsonValidated(req): JsonValidated<AdminLoginRequest>,
) -> Result<impl IntoResponse> {
    let tokens =
        auth_service::admin_login_with_token(&app, &i18n, &req.username, &req.password).await?;
    Ok(Json(tokens))
}

pub async fn refresh(
    State(app): State<AppContext>,
    JsonValidated(req): JsonValidated<RefreshTokenRequest>,
) -> Result<impl IntoResponse> {
    let tokens = auth_service::refresh_admin_token(&app, &req.refresh_token).await?;
    Ok(Json(tokens))
}

pub async fn logout(
    State(app): State<AppContext>,
    i18n: I18n,
    AuthenticatedModel(admin): Auth<Admin>,
) -> Result<impl IntoResponse> {
    admin.revoke_all_tokens(&app).await?;
    Ok(Json(MessageResponse::new(forge::t!(
        i18n,
        "auth.logged_out"
    ))))
}

pub async fn ws_token(
    State(app): State<AppContext>,
    AuthenticatedModel(admin): Auth<Admin>,
) -> Result<impl IntoResponse> {
    let tokens = admin
        .create_token_with_abilities(&app, "ws", admin_service::effective_permission_keys(&admin))
        .await?;
    Ok(Json(WsTokenResponse::new(tokens.access_token)))
}

pub async fn me(
    State(app): State<AppContext>,
    AuthenticatedModel(admin): Auth<Admin>,
) -> Result<impl IntoResponse> {
    admin_service::sync_active_token_abilities(&app, &admin).await?;
    Ok(Json(AdminMeResponse::from_admin(&admin)))
}
