use axum::extract::Path;
use forge::prelude::*;

use crate::domain::services::settings_service;
use crate::portals::admin::requests::UpdateSettingValueRequest;
use crate::validation::JsonValidated;

pub async fn show(
    State(app): State<AppContext>,
    i18n: I18n,
    Path(key): Path<String>,
) -> Result<impl IntoResponse> {
    Ok(Json(settings_service::detail(&app, &i18n, &key).await?))
}

pub async fn update(
    State(app): State<AppContext>,
    i18n: I18n,
    Path(key): Path<String>,
    JsonValidated(req): JsonValidated<UpdateSettingValueRequest>,
) -> Result<impl IntoResponse> {
    Ok(Json(
        settings_service::update_value(&app, &i18n, &key, req.value).await?,
    ))
}

pub async fn upload(
    State(app): State<AppContext>,
    i18n: I18n,
    Path(key): Path<String>,
    file: UploadedFile,
) -> Result<impl IntoResponse> {
    Ok(Json(
        settings_service::upload_value(&app, &i18n, &key, &file).await?,
    ))
}
