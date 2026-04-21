use crate::domain::models::Admin;
use crate::domain::services::badge_service;
use crate::portals::admin::responses::BadgeCountsResponse;
use axum::extract::State;
use forge::prelude::*;

pub async fn index(
    State(app): State<AppContext>,
    AuthenticatedModel(admin): Auth<Admin>,
) -> Result<impl IntoResponse> {
    let counts = badge_service::current_counts(&app, &admin).await?;
    Ok(Json(BadgeCountsResponse {
        counts: serde_json::to_value(counts).map_err(Error::other)?,
    }))
}
