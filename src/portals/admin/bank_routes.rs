use axum::extract::Path;
use forge::prelude::*;

use crate::domain::services::bank_service;
use crate::portals::admin::requests::UpsertBankRequest;
use crate::validation::JsonValidated;

pub async fn show(
    State(app): State<AppContext>,
    i18n: I18n,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    Ok(Json(bank_service::admin_detail(&app, &i18n, &id).await?))
}

pub async fn store(
    State(app): State<AppContext>,
    i18n: I18n,
    JsonValidated(req): JsonValidated<UpsertBankRequest>,
) -> Result<impl IntoResponse> {
    Ok(Json(bank_service::create(&app, &i18n, &req).await?))
}

pub async fn update(
    State(app): State<AppContext>,
    i18n: I18n,
    Path(id): Path<String>,
    JsonValidated(req): JsonValidated<UpsertBankRequest>,
) -> Result<impl IntoResponse> {
    Ok(Json(bank_service::update(&app, &i18n, &id, &req).await?))
}

pub async fn destroy(
    State(app): State<AppContext>,
    i18n: I18n,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    bank_service::delete(&app, &i18n, &id).await?;

    Ok(Json(MessageResponse::new(forge::t!(i18n, "Bank deleted"))))
}

pub async fn options(State(app): State<AppContext>, i18n: I18n) -> Result<impl IntoResponse> {
    Ok(Json(bank_service::admin_options(&app, &i18n).await?))
}
