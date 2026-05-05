use std::collections::BTreeMap;

use forge::prelude::*;
use serde::Serialize;
use serde_json::Value;
use ts_rs::TS;

use crate::domain::models::Bank;
use crate::portals::admin::requests::UpsertBankRequest;
use crate::portals::admin::responses::{AdminBankResponse, BankOptionResponse};
use crate::support::i18n::default_locale;

#[derive(Clone, Debug, Serialize, TS, forge::ApiSchema)]
#[ts(export)]
pub struct BankDatatableRow {
    pub id: String,
    pub country_iso2: String,
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
}

pub async fn admin_detail(app: &AppContext, i18n: &I18n, id: &str) -> Result<AdminBankResponse> {
    let bank = find_bank(app, i18n, id).await?;
    present_admin(app, &bank).await
}

pub async fn create(
    app: &AppContext,
    _i18n: &I18n,
    req: &UpsertBankRequest,
) -> Result<AdminBankResponse> {
    let names = sanitize_localized_values(&localized_map(&req.name));
    let bank = Bank::model_create()
        .set(Bank::COUNTRY_ISO2, req.country_iso2.clone())
        .save(app)
        .await?;

    sync_names(app, &bank, &names).await?;
    present_admin(app, &bank).await
}

pub async fn update(
    app: &AppContext,
    i18n: &I18n,
    id: &str,
    req: &UpsertBankRequest,
) -> Result<AdminBankResponse> {
    let bank = find_bank(app, i18n, id).await?;
    let names = sanitize_localized_values(&localized_map(&req.name));
    let updated = bank
        .update()
        .set(Bank::COUNTRY_ISO2, req.country_iso2.clone())
        .set(Bank::UPDATED_AT, DateTime::now())
        .save(app)
        .await?;

    sync_names(app, &updated, &names).await?;
    present_admin(app, &updated).await
}

pub async fn delete(app: &AppContext, i18n: &I18n, id: &str) -> Result<()> {
    let bank = find_bank(app, i18n, id).await?;
    bank.delete().execute(app).await?;
    Ok(())
}

pub async fn admin_options(app: &AppContext, i18n: &I18n) -> Result<Vec<BankOptionResponse>> {
    localized_options(app, i18n).await
}

pub async fn localized_options(app: &AppContext, i18n: &I18n) -> Result<Vec<BankOptionResponse>> {
    let db = app.database()?;
    let banks = Bank::model_query()
        .order_by(Bank::COUNTRY_ISO2.asc())
        .order_by(Bank::CREATED_AT.asc())
        .get(&*db)
        .await?;

    let default_locale = default_locale(app);
    let locale = i18n.locale();
    let mut options = Vec::with_capacity(banks.len());

    for bank in banks {
        options.push(BankOptionResponse {
            id: bank.id.to_string(),
            country_iso2: bank.country_iso2.clone(),
            name: localized_name(app, &bank, locale, &default_locale).await?,
        });
    }

    Ok(options)
}

pub async fn localized_name(
    app: &AppContext,
    bank: &Bank,
    locale: &str,
    default_locale: &str,
) -> Result<String> {
    if let Some(value) = non_empty_translation(app, bank, locale).await? {
        return Ok(value);
    }

    if locale != default_locale {
        if let Some(value) = non_empty_translation(app, bank, default_locale).await? {
            return Ok(value);
        }
    }

    Ok(String::new())
}

async fn find_bank(app: &AppContext, i18n: &I18n, id: &str) -> Result<Bank> {
    let bank_id: ModelId<Bank> = id
        .parse()
        .map_err(|_| Error::not_found(forge::t!(i18n, "error.not_found")))?;

    Bank::model_query()
        .where_(Bank::ID.eq(bank_id))
        .first(app.database()?.as_ref())
        .await?
        .ok_or_else(|| Error::not_found(forge::t!(i18n, "error.not_found")))
}

async fn present_admin(app: &AppContext, bank: &Bank) -> Result<AdminBankResponse> {
    let mut name = BTreeMap::new();

    for translation in bank.all_translations(app).await? {
        if translation.field == "name" {
            name.insert(translation.locale, translation.value);
        }
    }

    Ok(AdminBankResponse {
        id: bank.id.to_string(),
        country_iso2: bank.country_iso2.clone(),
        name: serde_json::to_value(name).map_err(Error::other)?,
        created_at: bank.created_at.to_string(),
        updated_at: bank.updated_at.to_string(),
    })
}

async fn sync_names(app: &AppContext, bank: &Bank, names: &BTreeMap<String, String>) -> Result<()> {
    let db = app.database()?;
    db.raw_execute(
        "DELETE FROM model_translations WHERE translatable_type = $1 AND translatable_id = $2::uuid AND field = 'name'",
        &[
            DbValue::Text(Bank::translatable_type().to_string()),
            DbValue::Text(bank.translatable_id()),
        ],
    )
    .await?;

    for (locale, value) in names {
        bank.set_translation(app, locale, "name", value).await?;
    }

    Ok(())
}

async fn non_empty_translation(
    app: &AppContext,
    bank: &Bank,
    locale: &str,
) -> Result<Option<String>> {
    Ok(bank
        .translation(app, locale, "name")
        .await?
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty()))
}

fn sanitize_localized_values(values: &BTreeMap<String, String>) -> BTreeMap<String, String> {
    values
        .iter()
        .filter_map(|(locale, value)| {
            let trimmed = value.trim();
            (!trimmed.is_empty()).then(|| (locale.clone(), trimmed.to_string()))
        })
        .collect()
}

fn localized_map(value: &Value) -> BTreeMap<String, String> {
    value
        .as_object()
        .map(|entries| {
            entries
                .iter()
                .filter_map(|(locale, entry)| {
                    entry
                        .as_str()
                        .map(|text| (locale.clone(), text.to_string()))
                })
                .collect()
        })
        .unwrap_or_default()
}
