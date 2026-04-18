use crate::domain::models::Admin;
use crate::portals::admin::requests::{
    ChangeAdminPasswordRequest, UpdateAdminLocaleRequest, UpdateAdminProfileRequest,
};
use crate::portals::admin::responses::AdminMeResponse;
use crate::validation::JsonValidated;
use forge::prelude::*;

pub async fn update_profile(
    State(app): State<AppContext>,
    i18n: I18n,
    AuthenticatedModel(admin): Auth<Admin>,
    JsonValidated(req): JsonValidated<UpdateAdminProfileRequest>,
) -> Result<impl IntoResponse> {
    let hash = app.hash()?;
    if !hash.check(&req.current_password, &admin.password_hash)? {
        return Err(Error::http(
            422,
            forge::t!(i18n, "auth.invalid_credentials"),
        ));
    }

    let updated = admin
        .update()
        .set(Admin::NAME, req.name.as_str())
        .set(Admin::EMAIL, req.email.as_str())
        .save(&app)
        .await?;

    Ok(Json(AdminMeResponse::from_admin(&updated)))
}

pub async fn update_locale(
    State(app): State<AppContext>,
    i18n: I18n,
    AuthenticatedModel(admin): Auth<Admin>,
    JsonValidated(req): JsonValidated<UpdateAdminLocaleRequest>,
) -> Result<impl IntoResponse> {
    admin
        .update()
        .set(Admin::LOCALE, req.locale.as_str())
        .save(&app)
        .await?;

    Ok(Json(MessageResponse::new(forge::t!(
        i18n,
        "Language updated"
    ))))
}

pub async fn change_password(
    State(app): State<AppContext>,
    i18n: I18n,
    AuthenticatedModel(admin): Auth<Admin>,
    JsonValidated(req): JsonValidated<ChangeAdminPasswordRequest>,
) -> Result<impl IntoResponse> {
    let hash = app.hash()?;
    if !hash.check(&req.current_password, &admin.password_hash)? {
        return Err(Error::http(
            422,
            forge::t!(i18n, "auth.invalid_credentials"),
        ));
    }

    admin
        .update()
        .set(Admin::PASSWORD_HASH, req.password.as_str())
        .save(&app)
        .await?;

    Ok(Json(MessageResponse::new(forge::t!(
        i18n,
        "Password changed"
    ))))
}
