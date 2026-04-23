use async_trait::async_trait;
use forge::prelude::*;
use serde::Deserialize;
use serde_json::Value;

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
