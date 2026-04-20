use axum::extract::Path;
use forge::prelude::*;

use crate::domain::services::page_service;
use crate::portals::admin::requests::{CreatePageRequest, UpdatePageRequest};
use crate::validation::JsonValidated;

pub async fn show(
    State(app): State<AppContext>,
    i18n: I18n,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    Ok(Json(page_service::detail(&app, &i18n, &id).await?))
}

pub async fn store(
    State(app): State<AppContext>,
    i18n: I18n,
    JsonValidated(req): JsonValidated<CreatePageRequest>,
) -> Result<impl IntoResponse> {
    Ok(Json(page_service::create(&app, &i18n, &req).await?))
}

pub async fn update(
    State(app): State<AppContext>,
    i18n: I18n,
    Path(id): Path<String>,
    JsonValidated(req): JsonValidated<UpdatePageRequest>,
) -> Result<impl IntoResponse> {
    Ok(Json(page_service::update(&app, &i18n, &id, &req).await?))
}

pub async fn destroy(
    State(app): State<AppContext>,
    i18n: I18n,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    page_service::delete(&app, &i18n, &id).await?;

    Ok(Json(MessageResponse::new(forge::t!(
        i18n,
        "admin.pages.deleted"
    ))))
}

pub async fn upload_cover(
    State(app): State<AppContext>,
    i18n: I18n,
    Path(id): Path<String>,
    file: UploadedFile,
) -> Result<impl IntoResponse> {
    Ok(Json(
        page_service::upload_cover(&app, &i18n, &id, file).await?,
    ))
}

pub async fn delete_cover(
    State(app): State<AppContext>,
    i18n: I18n,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    Ok(Json(page_service::delete_cover(&app, &i18n, &id).await?))
}
