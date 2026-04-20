use axum::extract::Query;
use axum::http::StatusCode;
use forge::prelude::*;

use crate::domain::models::Admin;
use crate::domain::services::credit_service;
use crate::portals::admin::requests::CreateAdminCreditAdjustmentRequest;
use crate::validation::JsonValidated;

#[derive(Debug, Deserialize)]
pub struct CreditUserLookupQuery {
    pub q: Option<String>,
}

pub async fn store(
    State(app): State<AppContext>,
    i18n: I18n,
    AuthenticatedModel(admin): Auth<Admin>,
    JsonValidated(req): JsonValidated<CreateAdminCreditAdjustmentRequest>,
) -> Result<impl IntoResponse> {
    let response = credit_service::admin_adjust(&app, &i18n, &admin, &req).await?;
    Ok((StatusCode::CREATED, Json(response)))
}

pub async fn user_options(
    State(app): State<AppContext>,
    Query(query): Query<CreditUserLookupQuery>,
) -> Result<impl IntoResponse> {
    let rows = credit_service::user_options(&app, query.q.as_deref()).await?;
    Ok(Json(rows))
}
