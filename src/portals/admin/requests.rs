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
