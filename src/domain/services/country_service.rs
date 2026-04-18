use forge::prelude::*;

use crate::domain::models::Country;
use crate::portals::admin::requests::UpdateCountryRequest;

pub async fn update(
    app: &AppContext,
    i18n: &I18n,
    iso2: &str,
    req: &UpdateCountryRequest,
) -> Result<Country> {
    let transaction = app.begin_transaction().await?;

    let country = Country::model_query()
        .where_(Country::ISO2.eq(iso2))
        .first(&transaction)
        .await?
        .ok_or_else(|| Error::not_found(forge::t!(i18n, "error.not_found")))?;

    ensure_default_preserved(&transaction, i18n, &country, req).await?;

    if req.is_default {
        transaction
            .raw_execute(
                r#"UPDATE countries
                   SET is_default = false
                   WHERE iso2 <> $1
                     AND is_default = true"#,
                &[DbValue::Text(country.iso2.clone())],
            )
            .await?;
    }

    let updated = country
        .update()
        .set(Country::STATUS, req.status.clone())
        .set(Country::CONVERSION_RATE, req.conversion_rate)
        .set(Country::IS_DEFAULT, req.is_default)
        .save(&transaction)
        .await?;

    transaction.commit().await?;

    Ok(updated)
}

async fn ensure_default_preserved<E>(
    executor: &E,
    i18n: &I18n,
    country: &Country,
    req: &UpdateCountryRequest,
) -> Result<()>
where
    E: QueryExecutor,
{
    if req.is_default {
        return Ok(());
    }

    if !country.is_default {
        return Ok(());
    }

    let other_default = Country::model_query()
        .where_(Country::ISO2.not_eq(country.iso2.as_str()))
        .where_(Country::IS_DEFAULT.eq(true))
        .first(executor)
        .await?;

    if other_default.is_some() {
        return Ok(());
    }

    Err(Error::http(
        422,
        forge::t!(i18n, "A default country is required."),
    ))
}
