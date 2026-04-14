use forge::prelude::*;
use crate::domain::services::auth_service;
use crate::portals::user::requests::LoginRequest;

pub async fn login(
    State(app): State<AppContext>,
    Validated(req): Validated<LoginRequest>,
) -> Result<impl IntoResponse> {
    let tokens = auth_service::login_with_token(&app, &req.email, &req.password).await?;
    Ok(Json(tokens))
}

pub async fn refresh(
    State(app): State<AppContext>,
    Json(body): Json<serde_json::Value>,
) -> Result<impl IntoResponse> {
    let refresh_token = body["refresh_token"]
        .as_str()
        .ok_or_else(|| Error::http(400, "refresh_token is required"))?;
    let tokens = app.tokens()?.refresh(refresh_token).await?;
    Ok(Json(tokens))
}
