use crate::domain::models::{Admin, User};
use crate::domain::services::user_service;
use crate::portals::admin::requests::{ChangeUserIntroducerRequest, CreateUserRequest};
use crate::portals::admin::resources::AdminUserResource;
use crate::validation::JsonValidated;
use axum::extract::{Path, Query};
use axum::http::StatusCode;
use forge::prelude::*;

#[derive(Debug, Deserialize)]
pub struct PaginationParams {
    #[serde(default = "default_page")]
    pub page: u64,
    #[serde(default = "default_per_page")]
    pub per_page: u64,
}

#[derive(Debug, Deserialize)]
pub struct UserLookupQuery {
    pub q: Option<String>,
}

fn default_page() -> u64 {
    1
}
fn default_per_page() -> u64 {
    15
}

impl From<PaginationParams> for Pagination {
    fn from(p: PaginationParams) -> Self {
        Pagination::new(p.page, p.per_page)
    }
}

pub async fn index(
    State(app): State<AppContext>,
    Query(params): Query<PaginationParams>,
) -> Result<impl IntoResponse> {
    let db = app.database()?;
    let paginated = User::model_query()
        .order_by(User::CREATED_AT.desc())
        .paginate(&*db, params.into())
        .await?;
    Ok(Json(AdminUserResource::paginated(
        &paginated,
        "/admin/users",
    )))
}

pub async fn show(
    State(app): State<AppContext>,
    i18n: I18n,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    let db = app.database()?;
    let model_id = parse_user_id(&i18n, &id)?;
    let user = User::model_query()
        .where_(User::ID.eq(model_id))
        .first(&*db)
        .await?
        .ok_or_else(|| Error::not_found(forge::t!(i18n, "error.user_not_found")))?;
    Ok(Json(AdminUserResource::make(&user)))
}

pub async fn store(
    State(app): State<AppContext>,
    i18n: I18n,
    JsonValidated(req): JsonValidated<CreateUserRequest>,
) -> Result<impl IntoResponse> {
    let user = user_service::create(&app, &i18n, &req).await?;
    Ok((StatusCode::CREATED, Json(AdminUserResource::make(&user))))
}

pub async fn user_options(
    State(app): State<AppContext>,
    Query(query): Query<UserLookupQuery>,
) -> Result<impl IntoResponse> {
    let rows = user_service::user_options(&app, query.q.as_deref()).await?;
    Ok(Json(rows))
}

pub async fn store_introducer_change(
    State(app): State<AppContext>,
    i18n: I18n,
    AuthenticatedModel(admin): Auth<Admin>,
    Path(id): Path<String>,
    JsonValidated(req): JsonValidated<ChangeUserIntroducerRequest>,
) -> Result<impl IntoResponse> {
    let user_id = parse_user_id(&i18n, &id)?;
    let response = user_service::change_introducer(&app, &i18n, &admin, user_id, &req).await?;
    Ok((StatusCode::CREATED, Json(response)))
}

fn parse_user_id(i18n: &I18n, value: &str) -> Result<ModelId<User>> {
    value
        .parse()
        .map_err(|_| Error::not_found(forge::t!(i18n, "error.user_not_found")))
}
