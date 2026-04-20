use std::collections::BTreeMap;

use crate::domain::enums::AdminType;
use crate::ids;
use crate::ids::permissions::Permission;
use async_trait::async_trait;
use forge::countries::CountryStatus;
use forge::prelude::*;
use serde::Deserialize;
use serde_json::Value;

#[derive(Debug, Deserialize, ts_rs::TS, forge::ApiSchema)]
#[ts(export)]
pub struct AdminLoginRequest {
    pub username: String,
    pub password: String,
}

#[async_trait]
impl RequestValidator for AdminLoginRequest {
    async fn validate(&self, validator: &mut Validator) -> Result<()> {
        validator
            .field("username", &self.username)
            .bail()
            .required()
            .rule(ids::validation::USERNAME)
            .apply()
            .await?;

        validator
            .field("password", &self.password)
            .bail()
            .required()
            .rule(ids::validation::PASSWORD)
            .apply()
            .await?;

        Ok(())
    }
}

#[derive(Debug, Deserialize, ts_rs::TS, forge::ApiSchema, forge::Validate)]
#[ts(export)]
pub struct UpdateAdminProfileRequest {
    #[validate(required, min(2), max(100))]
    pub name: String,
    #[validate(required, email)]
    pub email: String,
    #[validate(required)]
    pub current_password: String,
}

#[derive(Debug, Deserialize, ts_rs::TS, forge::ApiSchema)]
#[ts(export)]
pub struct ChangeAdminPasswordRequest {
    pub current_password: String,
    pub password: String,
    pub password_confirmation: String,
}

#[async_trait]
impl RequestValidator for ChangeAdminPasswordRequest {
    async fn validate(&self, validator: &mut Validator) -> Result<()> {
        validator
            .field("current_password", &self.current_password)
            .bail()
            .required()
            .apply()
            .await?;

        validator
            .field("password", &self.password)
            .bail()
            .required()
            .rule(ids::validation::PASSWORD)
            .confirmed("password_confirmation", &self.password_confirmation)
            .apply()
            .await?;

        Ok(())
    }
}

#[derive(Debug, Deserialize, ts_rs::TS, forge::ApiSchema)]
#[ts(export)]
pub struct UpdateAdminLocaleRequest {
    pub locale: String,
}

#[async_trait]
impl RequestValidator for UpdateAdminLocaleRequest {
    async fn validate(&self, validator: &mut Validator) -> Result<()> {
        let locales = validator
            .app()
            .i18n()
            .map(|manager| {
                manager
                    .locale_list()
                    .into_iter()
                    .map(str::to_string)
                    .collect::<Vec<_>>()
            })
            .unwrap_or_else(|_| vec!["en".to_string()]);

        validator
            .field("locale", &self.locale)
            .bail()
            .required()
            .in_list(locales)
            .apply()
            .await?;

        Ok(())
    }
}

#[derive(Debug, Deserialize, ts_rs::TS, forge::ApiSchema)]
#[ts(export)]
pub struct UpdateCountryRequest {
    pub status: CountryStatus,
    pub conversion_rate: Option<f64>,
    pub is_default: bool,
}

#[async_trait]
impl RequestValidator for UpdateCountryRequest {
    async fn validate(&self, validator: &mut Validator) -> Result<()> {
        validator
            .field("status", self.status.as_str())
            .bail()
            .required()
            .app_enum::<CountryStatus>()
            .apply()
            .await?;

        Ok(())
    }
}

#[derive(Debug, Deserialize, ts_rs::TS, forge::ApiSchema)]
#[ts(export)]
pub struct UpdateSettingValueRequest {
    #[ts(type = "unknown")]
    pub value: Option<Value>,
}

#[async_trait]
impl RequestValidator for UpdateSettingValueRequest {
    async fn validate(&self, _validator: &mut Validator) -> Result<()> {
        Ok(())
    }
}

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

#[derive(Debug)]
pub struct UploadEditorAssetRequest {
    pub folder: String,
    pub kind: String,
    pub file: UploadedFile,
}

impl UploadEditorAssetRequest {
    pub fn from_multipart(i18n: &I18n, form: MultipartForm) -> Result<Self> {
        let folder = required_text(i18n, &form, "folder")?.to_string();
        let kind = required_text(i18n, &form, "kind")?.to_string();
        let file = form
            .file("file")
            .map_err(|_| missing_field_error(i18n, "file"))?;

        Ok(Self {
            folder,
            kind,
            file: UploadedFile {
                field_name: file.field_name.clone(),
                original_name: file.original_name.clone(),
                content_type: file.content_type.clone(),
                size: file.size,
                temp_path: file.temp_path.clone(),
            },
        })
    }
}

fn required_text<'a>(i18n: &I18n, form: &'a MultipartForm, field: &str) -> Result<&'a str> {
    form.text(field)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| missing_field_error(i18n, field))
}

fn missing_field_error(i18n: &I18n, field: &str) -> Error {
    let message = match field {
        "folder" => forge::t!(i18n, "admin.editor_assets.errors.folder_required"),
        "kind" => forge::t!(i18n, "admin.editor_assets.errors.kind_required"),
        "file" => forge::t!(i18n, "admin.editor_assets.errors.file_required"),
        _ => forge::t!(i18n, "validation.invalid_request_body"),
    };

    Error::http(422, message)
}

#[derive(Debug, Deserialize, ts_rs::TS, forge::ApiSchema)]
#[ts(export)]
pub struct LogQuery {
    /// Comma-separated list of levels (e.g. `ERROR,WARN`). Empty/None = no filter.
    pub levels: Option<String>,
    /// Default 500, capped at 5000 by the handler.
    pub limit: Option<u64>,
}

#[derive(Debug, Deserialize, ts_rs::TS, forge::ApiSchema)]
#[ts(export)]
pub struct CreateAdminRequest {
    pub username: String,
    pub email: String,
    pub name: String,
    pub password: String,
    pub admin_type: AdminType,
    pub permissions: Vec<Permission>,
    pub locale: String,
}

#[async_trait]
impl RequestValidator for CreateAdminRequest {
    async fn validate(&self, validator: &mut Validator) -> Result<()> {
        let locales = validator
            .app()
            .i18n()
            .map(|manager| {
                manager
                    .locale_list()
                    .into_iter()
                    .map(str::to_string)
                    .collect::<Vec<_>>()
            })
            .unwrap_or_else(|_| vec!["en".to_string()]);

        validator
            .field("username", &self.username)
            .bail()
            .required()
            .min(3)
            .max(50)
            .rule(ids::validation::USERNAME)
            .apply()
            .await?;

        validator
            .field("email", &self.email)
            .bail()
            .required()
            .email()
            .apply()
            .await?;

        validator
            .field("name", &self.name)
            .bail()
            .required()
            .min(2)
            .max(100)
            .apply()
            .await?;

        validator
            .field("password", &self.password)
            .bail()
            .required()
            .rule(ids::validation::PASSWORD)
            .apply()
            .await?;

        validator
            .field("admin_type", self.admin_type.as_str())
            .bail()
            .required()
            .app_enum::<AdminType>()
            .apply()
            .await?;

        validator
            .each("permissions", &self.permissions)
            .app_enum::<Permission>()
            .apply()
            .await?;

        validator
            .field("locale", &self.locale)
            .bail()
            .required()
            .in_list(locales)
            .apply()
            .await?;

        Ok(())
    }
}

#[derive(Debug, Deserialize, ts_rs::TS, forge::ApiSchema)]
#[ts(export)]
pub struct UpdateAdminRequest {
    pub name: Option<String>,
    pub email: Option<String>,
    pub password: Option<String>,
    pub permissions: Option<Vec<Permission>>,
    pub admin_type: Option<AdminType>,
    pub locale: Option<String>,
}

#[async_trait]
impl RequestValidator for UpdateAdminRequest {
    async fn validate(&self, validator: &mut Validator) -> Result<()> {
        let locales = validator
            .app()
            .i18n()
            .map(|manager| {
                manager
                    .locale_list()
                    .into_iter()
                    .map(str::to_string)
                    .collect::<Vec<_>>()
            })
            .unwrap_or_else(|_| vec!["en".to_string()]);

        if let Some(name) = self.name.as_deref() {
            validator
                .field("name", name)
                .bail()
                .min(2)
                .max(100)
                .apply()
                .await?;
        }

        if let Some(email) = self.email.as_deref() {
            validator
                .field("email", email)
                .bail()
                .email()
                .apply()
                .await?;
        }

        if let Some(password) = self.password.as_deref() {
            validator
                .field("password", password)
                .bail()
                .rule(ids::validation::PASSWORD)
                .apply()
                .await?;
        }

        if let Some(admin_type) = self.admin_type {
            validator
                .field("admin_type", admin_type.as_str())
                .bail()
                .app_enum::<AdminType>()
                .apply()
                .await?;
        }

        if let Some(permissions) = self.permissions.as_ref() {
            validator
                .each("permissions", permissions)
                .app_enum::<Permission>()
                .apply()
                .await?;
        }

        if let Some(locale) = self.locale.as_deref() {
            validator
                .field("locale", locale)
                .bail()
                .in_list(locales)
                .apply()
                .await?;
        }

        Ok(())
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
    let locales = validator
        .app()
        .i18n()
        .map(|manager| {
            manager
                .locale_list()
                .into_iter()
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_else(|_| vec!["en".to_string()]);
    let default_locale = validator
        .app()
        .i18n()
        .map(|manager| manager.default_locale().to_string())
        .unwrap_or_else(|_| "en".to_string());

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
