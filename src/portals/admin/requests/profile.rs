use crate::support::validation::{validate_required_locale, validate_required_password};
use async_trait::async_trait;
use forge::prelude::*;
use serde::Deserialize;

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

        validate_required_password(validator, "password", &self.password).await?;
        validator
            .field("password", &self.password)
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
        validate_required_locale(validator, "locale", &self.locale).await?;

        Ok(())
    }
}
