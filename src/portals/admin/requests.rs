use async_trait::async_trait;
use forge::prelude::*;
use forge::validation::FromMultipart;
use serde::Deserialize;

#[derive(Debug, Deserialize, ts_rs::TS)]
#[ts(export)]
pub struct AdminLoginRequest {
    pub email: String,
    pub password: String,
}

#[async_trait]
impl RequestValidator for AdminLoginRequest {
    async fn validate(&self, validator: &mut Validator) -> Result<()> {
        validator
            .field("email", &self.email)
            .bail()
            .required()
            .email()
            .apply()
            .await?;

        validator
            .field("password", &self.password)
            .required()
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
