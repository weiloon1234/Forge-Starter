use crate::domain::enums::enum_key_string;
use crate::domain::enums::AdminType;
use crate::ids::permissions::Permission;
use crate::support::validation::{
    validate_optional_email, validate_optional_locale, validate_optional_name,
    validate_optional_password, validate_required_email, validate_required_locale,
    validate_required_name, validate_required_password, validate_required_username,
};
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
        validate_required_username(validator, "username", &self.username).await?;
        validate_required_email(validator, "email", &self.email).await?;
        validate_required_name(validator, "name", &self.name).await?;
        validate_required_password(validator, "password", &self.password).await?;

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

        validate_required_locale(validator, "locale", &self.locale).await?;

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
        validate_optional_name(validator, "name", self.name.as_deref()).await?;
        validate_optional_email(validator, "email", self.email.as_deref()).await?;
        validate_optional_password(validator, "password", self.password.as_deref()).await?;

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

        validate_optional_locale(validator, "locale", self.locale.as_deref()).await?;

        Ok(())
    }
}
