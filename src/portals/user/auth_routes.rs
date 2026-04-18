use crate::domain::services::auth_service;
use crate::portals::user::requests::LoginRequest;
use crate::validation::JsonValidated;
use forge::prelude::*;

pub async fn login(
    State(app): State<AppContext>,
    i18n: I18n,
    JsonValidated(req): JsonValidated<LoginRequest>,
) -> Result<impl IntoResponse> {
    let tokens = auth_service::login_with_token(&app, &i18n, &req.email, &req.password).await?;
    Ok(Json(tokens))
}

pub async fn refresh(
    State(app): State<AppContext>,
    JsonValidated(req): JsonValidated<RefreshTokenRequest>,
) -> Result<impl IntoResponse> {
    let tokens = auth_service::refresh_user_token(&app, &req.refresh_token).await?;
    Ok(Json(tokens))
}
