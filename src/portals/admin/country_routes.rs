use crate::domain::services::country_service;
use crate::portals::admin::requests::UpdateCountryRequest;
use crate::validation::JsonValidated;
use axum::extract::Path;
use forge::prelude::*;

pub async fn update(
    State(app): State<AppContext>,
    i18n: I18n,
    Path(iso2): Path<String>,
    JsonValidated(req): JsonValidated<UpdateCountryRequest>,
) -> Result<impl IntoResponse> {
    country_service::update(&app, &i18n, &iso2, &req).await?;

    Ok(Json(MessageResponse::new(forge::t!(
        i18n,
        "Country updated"
    ))))
}
