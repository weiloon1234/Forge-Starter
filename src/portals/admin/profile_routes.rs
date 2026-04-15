use forge::prelude::*;
use crate::domain::models::Admin;
use crate::portals::admin::requests::{ChangeAdminPasswordRequest, UpdateAdminLocaleRequest, UpdateAdminProfileRequest};
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

    Ok(Json(AdminMeResponse::from(&updated)))
}

pub async fn update_locale(
    State(app): State<AppContext>,
    AuthenticatedModel(admin): Auth<Admin>,
    Validated(req): Validated<UpdateAdminLocaleRequest>,
) -> Result<impl IntoResponse> {
    admin
        .update()
        .set(Admin::LOCALE, req.locale.as_str())
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
