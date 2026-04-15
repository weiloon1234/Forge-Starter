use axum::extract::Path;
use forge::prelude::*;
use crate::domain::models::Country;
use crate::portals::admin::requests::UpdateCountryRequest;

pub async fn update(
    State(app): State<AppContext>,
    i18n: I18n,
    Path(iso2): Path<String>,
    Validated(req): Validated<UpdateCountryRequest>,
) -> Result<impl IntoResponse> {
    let db = app.database()?;
    let country = Country::model_query()
        .where_(Country::ISO2.eq(iso2.as_str()))
        .first(&*db)
        .await?
        .ok_or_else(|| Error::not_found(forge::t!(i18n, "error.not_found")))?;

    let mut update = country.update();
    update = update.set(Country::STATUS, req.status.as_str());
    if let Some(rate) = req.conversion_rate {
        update = update.set(Country::CONVERSION_RATE, rate);
    }
    update.save(&app).await?;

    Ok(Json(serde_json::json!({ "message": "ok" })))
}
