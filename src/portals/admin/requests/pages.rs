use async_trait::async_trait;
use forge::prelude::*;
use serde::Deserialize;
use serde_json::Value;
use std::collections::BTreeMap;

use crate::support::i18n::{available_locales, default_locale};

#[derive(Debug, Deserialize, ts_rs::TS, forge::ApiSchema)]
#[ts(export)]
pub struct CreatePageRequest {
    pub slug: String,
    #[ts(type = "Record<string, string>")]
    pub title: Value,
    #[ts(type = "Record<string, string>")]
    pub content: Value,
}

#[async_trait]
impl RequestValidator for CreatePageRequest {
    async fn validate(&self, validator: &mut Validator) -> Result<()> {
        validate_page_request(self, validator).await
    }
}

#[derive(Debug, Deserialize, ts_rs::TS, forge::ApiSchema)]
#[ts(export)]
pub struct UpdatePageRequest {
    pub slug: String,
    #[ts(type = "Record<string, string>")]
    pub title: Value,
    #[ts(type = "Record<string, string>")]
    pub content: Value,
}

#[async_trait]
impl RequestValidator for UpdatePageRequest {
    async fn validate(&self, validator: &mut Validator) -> Result<()> {
        validate_page_request(self, validator).await
    }
}

trait PagePayload {
    fn slug(&self) -> &str;
    fn title(&self) -> &Value;
    fn content(&self) -> &Value;
}

impl PagePayload for CreatePageRequest {
    fn slug(&self) -> &str {
        &self.slug
    }

    fn title(&self) -> &Value {
        &self.title
    }

    fn content(&self) -> &Value {
        &self.content
    }
}

impl PagePayload for UpdatePageRequest {
    fn slug(&self) -> &str {
        &self.slug
    }

    fn title(&self) -> &Value {
        &self.title
    }

    fn content(&self) -> &Value {
        &self.content
    }
}

async fn validate_page_request<T: PagePayload>(req: &T, validator: &mut Validator) -> Result<()> {
    let i18n = validator.app().i18n().ok();
    let locales = available_locales(validator.app());
    let default_locale = default_locale(validator.app());

    if let Some(manager) = i18n.as_ref() {
        let slug_label = manager.translate(&default_locale, "admin.pages.fields.slug", &[]);
        let title_label = manager.translate(&default_locale, "admin.pages.fields.title", &[]);
        let content_label = manager.translate(&default_locale, "admin.pages.fields.content", &[]);
        validator.custom_attribute("slug", slug_label);
        validator.custom_attribute(format!("title.{default_locale}"), title_label);
        validator.custom_attribute(format!("content.{default_locale}"), content_label);
    }

    validator
        .field("slug", req.slug())
        .bail()
        .required()
        .max(160)
        .apply()
        .await?;

    let title = parse_localized_map("title", req.title(), validator)?;
    let content = parse_localized_map("content", req.content(), validator)?;

    validate_localized_map(validator, "title", &title, &locales, &default_locale).await?;
    validate_localized_map(validator, "content", &content, &locales, &default_locale).await?;

    Ok(())
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

async fn validate_localized_map(
    validator: &mut Validator,
    field: &str,
    values: &BTreeMap<String, String>,
    locales: &[String],
    default_locale: &str,
) -> Result<()> {
    if let Some(value) = values.get(default_locale) {
        validator
            .field(format!("{field}.{default_locale}"), value)
            .bail()
            .required()
            .apply()
            .await?;
    } else {
        validator
            .field(format!("{field}.{default_locale}"), "")
            .bail()
            .required()
            .apply()
            .await?;
    }

    for (locale, value) in values {
        validator
            .field(format!("{field}.{locale}.locale"), locale)
            .bail()
            .in_list(locales.to_vec())
            .apply()
            .await?;

        if locale == default_locale {
            continue;
        }

        if value.trim().is_empty() {
            continue;
        }
    }

    Ok(())
}
