use async_trait::async_trait;
use forge::prelude::*;
use forge::validation::FromMultipart;
use serde::Deserialize;
use crate::ids;

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

#[async_trait]
impl FromMultipart for AdminLoginRequest {
    async fn from_multipart(_multipart: &mut axum::extract::Multipart) -> Result<Self> {
        Err(Error::http(415, "multipart not supported"))
    }
}

#[derive(Debug, Deserialize, ts_rs::TS, forge::ApiSchema)]
#[ts(export)]
pub struct UpdateAdminProfileRequest {
    pub name: String,
    pub email: String,
    pub current_password: String,
}

#[async_trait]
impl RequestValidator for UpdateAdminProfileRequest {
    async fn validate(&self, validator: &mut Validator) -> Result<()> {
        validator
            .field("name", &self.name)
            .bail()
            .required()
            .min(2)
            .max(100)
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
            .field("current_password", &self.current_password)
            .bail()
            .required()
            .apply()
            .await?;

        Ok(())
    }
}

#[async_trait]
impl FromMultipart for UpdateAdminProfileRequest {
    async fn from_multipart(_multipart: &mut axum::extract::Multipart) -> Result<Self> {
        Err(Error::http(415, "multipart not supported"))
    }
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

#[async_trait]
impl FromMultipart for ChangeAdminPasswordRequest {
    async fn from_multipart(_multipart: &mut axum::extract::Multipart) -> Result<Self> {
        Err(Error::http(415, "multipart not supported"))
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
        validator
            .field("locale", &self.locale)
            .bail()
            .required()
            .in_list(["en", "zh"])
            .apply()
            .await?;

        Ok(())
    }
}

#[async_trait]
impl FromMultipart for UpdateAdminLocaleRequest {
    async fn from_multipart(_multipart: &mut axum::extract::Multipart) -> Result<Self> {
        Err(Error::http(415, "multipart not supported"))
    }
}
