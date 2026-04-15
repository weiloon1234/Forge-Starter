use forge::prelude::*;
use crate::domain::models::Admin;
use crate::portals::admin::requests::{ChangeAdminPasswordRequest, UpdateAdminProfileRequest};
use crate::portals::admin::responses::AdminMeResponse;

pub async fn update_profile(
    State(app): State<AppContext>,
    AuthenticatedModel(admin): Auth<Admin>,
    Validated(req): Validated<UpdateAdminProfileRequest>,
) -> Result<impl IntoResponse> {
    let hash = app.hash()?;
    if !hash.check(&req.current_password, &admin.password_hash)? {
        return Err(Error::http(422, "Current password is incorrect"));
    }

    let updated = admin
        .update()
        .set(Admin::NAME, req.name.as_str())
        .set(Admin::EMAIL, req.email.as_str())
        .save(&app)
        .await?;

    Ok(Json(AdminMeResponse {
        id: updated.id.to_string(),
        username: updated.username.clone(),
        email: updated.email.clone(),
        name: updated.name.clone(),
        admin_type: updated.admin_type.clone(),
        locale: updated.locale.clone(),
    }))
}

pub async fn update_locale(
    State(app): State<AppContext>,
    AuthenticatedModel(admin): Auth<Admin>,
    Json(body): Json<serde_json::Value>,
) -> Result<impl IntoResponse> {
    let locale = body["locale"]
        .as_str()
        .ok_or_else(|| Error::http(422, "Locale is required"))?;

    admin
        .update()
        .set(Admin::LOCALE, locale)
        .save(&app)
        .await?;

    Ok(Json(serde_json::json!({ "message": "ok" })))
}

pub async fn change_password(
    State(app): State<AppContext>,
    AuthenticatedModel(admin): Auth<Admin>,
    Validated(req): Validated<ChangeAdminPasswordRequest>,
) -> Result<impl IntoResponse> {
    let hash = app.hash()?;
    if !hash.check(&req.current_password, &admin.password_hash)? {
        return Err(Error::http(422, "Current password is incorrect"));
    }

    admin
        .update()
        .set(Admin::PASSWORD_HASH, req.password.as_str())
        .save(&app)
        .await?;

    Ok(Json(serde_json::json!({ "message": "Password changed" })))
}
