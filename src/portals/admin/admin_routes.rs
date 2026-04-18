use axum::extract::{Path, Query};
use axum::http::StatusCode;
use forge::prelude::*;

use crate::domain::models::Admin;
use crate::domain::services::admin_service;
use crate::portals::admin::requests::{CreateAdminRequest, UpdateAdminRequest};
use crate::portals::admin::resources::AdminResource;
use crate::portals::admin::responses::{AdminPermissionResponse, AdminResponse};
use crate::validation::JsonValidated;

#[derive(Debug, Deserialize)]
pub struct PaginationParams {
    #[serde(default = "default_page")]
    pub page: u64,
    #[serde(default = "default_per_page")]
    pub per_page: u64,
}

fn default_page() -> u64 {
    1
}

fn default_per_page() -> u64 {
    15
}

impl From<PaginationParams> for Pagination {
    fn from(value: PaginationParams) -> Self {
        Pagination::new(value.page, value.per_page)
    }
}

pub async fn index(
    State(app): State<AppContext>,
    AuthenticatedModel(actor): Auth<Admin>,
    Query(params): Query<PaginationParams>,
) -> Result<impl IntoResponse> {
    let paginated = admin_service::list_for_actor(&app, &actor, params.into()).await?;
    Ok(Json(AdminResource::paginated(&paginated, "/admin/admins")))
}

pub async fn permissions(AuthenticatedModel(actor): Auth<Admin>) -> Result<impl IntoResponse> {
    let body: Vec<AdminPermissionResponse> = admin_service::permission_catalogue(&actor)
        .into_iter()
        .map(|(permission, grantable)| AdminPermissionResponse {
            permission,
            grantable,
        })
        .collect();

    Ok(Json(body))
}

pub async fn show(
    State(app): State<AppContext>,
    i18n: I18n,
    AuthenticatedModel(actor): Auth<Admin>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    let admin = admin_service::show(&app, &i18n, &actor, &id).await?;
    Ok(Json(AdminResponse::from(&admin)))
}

pub async fn store(
    State(app): State<AppContext>,
    i18n: I18n,
    AuthenticatedModel(actor): Auth<Admin>,
    JsonValidated(req): JsonValidated<CreateAdminRequest>,
) -> Result<impl IntoResponse> {
    let admin = admin_service::create(&app, &i18n, &actor, &req).await?;
    Ok((StatusCode::CREATED, Json(AdminResponse::from(&admin))))
}

pub async fn update(
    State(app): State<AppContext>,
    i18n: I18n,
    AuthenticatedModel(actor): Auth<Admin>,
    Path(id): Path<String>,
    JsonValidated(req): JsonValidated<UpdateAdminRequest>,
) -> Result<impl IntoResponse> {
    let admin = admin_service::update(&app, &i18n, &actor, &id, &req).await?;
    Ok(Json(AdminResponse::from(&admin)))
}

pub async fn destroy(
    State(app): State<AppContext>,
    i18n: I18n,
    AuthenticatedModel(actor): Auth<Admin>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    admin_service::delete(&app, &i18n, &actor, &id).await?;
    Ok(Json(MessageResponse::new(forge::t!(
        i18n,
        "admin.admins.deleted"
    ))))
}
