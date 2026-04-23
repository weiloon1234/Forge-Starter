use crate::domain::enums::enum_key_string;
use crate::domain::enums::AdminType;
use crate::ids;
use crate::ids::permissions::Permission;
use async_trait::async_trait;
use forge::prelude::*;
use serde::Deserialize;

#[derive(Debug, Deserialize, ts_rs::TS, forge::ApiSchema)]
#[ts(export)]
pub struct CreateAdminRequest {
    pub username: String,
    pub email: String,
    pub name: String,
    pub password: String,
    #[ts(type = "import(\"./AdminType\").AdminType")]
    pub admin_type: AdminType,
    #[ts(type = "Array<import(\"./Permission\").Permission>")]
    pub permissions: Vec<Permission>,
    pub locale: String,
}

#[async_trait]
impl RequestValidator for CreateAdminRequest {
    async fn validate(&self, validator: &mut Validator) -> Result<()> {
        let admin_type = enum_key_string(self.admin_type);
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
            .field("admin_type", &admin_type)
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
    #[ts(type = "Array<import(\"./Permission\").Permission> | null")]
    pub permissions: Option<Vec<Permission>>,
    #[ts(type = "import(\"./AdminType\").AdminType | null")]
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
            let admin_type = enum_key_string(admin_type);
            validator
                .field("admin_type", &admin_type)
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
