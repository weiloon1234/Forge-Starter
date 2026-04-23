use crate::domain::enums::enum_key_string;
use async_trait::async_trait;
use forge::countries::CountryStatus;
use forge::prelude::*;
use serde::Deserialize;

#[derive(Debug, Deserialize, ts_rs::TS, forge::ApiSchema)]
#[ts(export)]
pub struct UpdateCountryRequest {
    #[ts(type = "import(\"./CountryStatus\").CountryStatus")]
    pub status: CountryStatus,
    pub conversion_rate: Option<f64>,
    pub is_default: bool,
}

#[async_trait]
impl RequestValidator for UpdateCountryRequest {
    async fn validate(&self, validator: &mut Validator) -> Result<()> {
        let status = enum_key_string(self.status.clone());
        validator
            .field("status", &status)
            .bail()
            .required()
            .app_enum::<CountryStatus>()
            .apply()
            .await?;

        Ok(())
    }
}
