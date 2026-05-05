use async_trait::async_trait;
use forge::prelude::*;
use serde::Deserialize;
use serde_json::Value;
use std::collections::BTreeMap;

use crate::ids;
use crate::support::i18n::{available_locales, default_locale};

#[derive(Debug, Deserialize, ts_rs::TS, forge::ApiSchema)]
#[ts(export)]
pub struct UpsertBankRequest {
    pub country_iso2: String,
    #[ts(type = "Record<string, string>")]
    pub name: Value,
}

#[async_trait]
impl RequestValidator for UpsertBankRequest {
    async fn validate(&self, validator: &mut Validator) -> Result<()> {
        validator
            .field("country_iso2", &self.country_iso2)
            .bail()
            .required()
            .rule(ids::validation::ACTIVE_COUNTRY)
            .apply()
            .await?;

        let locales = available_locales(validator.app());
        let default_locale = default_locale(validator.app());
        let names = parse_localized_map("name", &self.name, validator)?;

        if let Some(value) = names.get(&default_locale) {
            validator
                .field(format!("name.{default_locale}"), value)
                .bail()
                .required()
                .max(120)
                .apply()
                .await?;
        } else {
            validator
                .field(format!("name.{default_locale}"), "")
                .bail()
                .required()
                .apply()
                .await?;
        }

        for (locale, value) in names {
            validator
                .field(format!("name.{locale}.locale"), &locale)
                .bail()
                .in_list(locales.clone())
                .apply()
                .await?;

            if value.trim().is_empty() {
                continue;
            }

            validator
                .field(format!("name.{locale}"), &value)
                .max(120)
                .apply()
                .await?;
        }

        Ok(())
    }
}

fn parse_localized_map(
    field: &str,
    value: &Value,
    validator: &mut Validator,
) -> Result<BTreeMap<String, String>> {
    let Some(object) = value.as_object() else {
        validator.add_error(field, "invalid_request_body", &[]);
        return Ok(BTreeMap::new());
    };

    let mut localized = BTreeMap::new();
    for (locale, entry) in object {
        if let Some(text) = entry.as_str() {
            localized.insert(locale.clone(), text.to_string());
        } else {
            validator.add_error(&format!("{field}.{locale}"), "invalid_request_body", &[]);
        }
    }

    Ok(localized)
}
