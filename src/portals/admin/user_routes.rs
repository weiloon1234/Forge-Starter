use crate::domain::models::User;
use crate::portals::admin::resources::AdminUserResource;
use axum::extract::{Path, Query};
use forge::prelude::*;

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
    let model_id: ModelId<User> = id
        .parse()
        .map_err(|_| Error::not_found(forge::t!(i18n, "error.user_not_found")))?;
    let user = User::model_query()
        .where_(User::ID.eq(model_id))
        .first(&*db)
        .await?
        .ok_or_else(|| Error::not_found(forge::t!(i18n, "error.user_not_found")))?;
    Ok(Json(AdminUserResource::make(&user)))
}
