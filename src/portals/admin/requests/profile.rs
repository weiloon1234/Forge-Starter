use crate::ids;
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
