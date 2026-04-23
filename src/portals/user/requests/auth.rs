use async_trait::async_trait;
use forge::prelude::*;
use serde::Deserialize;

use crate::ids;

#[derive(Debug, Deserialize, ts_rs::TS, forge::ApiSchema)]
#[ts(export)]
pub struct LoginRequest {
    pub login: String,
    pub password: String,
}

#[async_trait]
impl RequestValidator for LoginRequest {
    async fn validate(&self, validator: &mut Validator) -> Result<()> {
        validator
            .field("login", &self.login)
            .bail()
            .required()
            .max(255)
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
