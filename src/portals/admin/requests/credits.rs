use crate::domain::enums::enum_key_string;
use crate::domain::enums::{CreditAdjustmentOperation, CreditType};
use async_trait::async_trait;
use forge::prelude::*;
use serde::Deserialize;
use serde_json::Value;

#[derive(Debug, Deserialize, ts_rs::TS, forge::ApiSchema)]
#[ts(export)]
pub struct CreateAdminCreditAdjustmentRequest {
    pub user_id: String,
    #[ts(type = "import(\"./CreditType\").CreditType")]
    pub credit_type: CreditType,
    #[ts(type = "import(\"./CreditAdjustmentOperation\").CreditAdjustmentOperation")]
    pub operation: CreditAdjustmentOperation,
    pub amount: String,
    #[ts(type = "Record<string, string>")]
    pub explanation_overrides: Option<Value>,
    pub remark: Option<String>,
    pub related_key: Option<String>,
    pub related_type: Option<String>,
    #[ts(type = "Record<string, unknown>")]
    pub context: Option<Value>,
}

#[async_trait]
impl RequestValidator for CreateAdminCreditAdjustmentRequest {
    async fn validate(&self, validator: &mut Validator) -> Result<()> {
        let credit_type = enum_key_string(self.credit_type);
        let operation = enum_key_string(self.operation);
        validator.custom_attribute("user_id", "admin.credits.fields.user");
        validator.custom_attribute("credit_type", "admin.credits.fields.credit_type");
        validator.custom_attribute("operation", "admin.credits.fields.operation");
        validator.custom_attribute("amount", "admin.credits.fields.amount");
        validator.custom_attribute("related_key", "admin.credits.fields.related_key");

        validator
            .field("user_id", &self.user_id)
            .bail()
            .required()
            .uuid()
            .apply()
            .await?;

        validator
            .field("credit_type", &credit_type)
            .bail()
            .required()
            .app_enum::<CreditType>()
            .apply()
            .await?;

        validator
            .field("operation", &operation)
            .bail()
            .required()
            .app_enum::<CreditAdjustmentOperation>()
            .apply()
            .await?;

        validator
            .field("amount", &self.amount)
            .bail()
            .required()
            .numeric()
            .min_numeric(0.00000001)
            .apply()
            .await?;

        if let Some(related_key) = self.related_key.as_deref() {
            validator
                .field("related_key", related_key)
                .bail()
                .uuid()
                .apply()
                .await?;
        }

        if !value_is_string_map(&self.explanation_overrides) {
            validator.add_error("explanation_overrides", "invalid", &[]);
        }

        if !value_is_object(&self.context) {
            validator.add_error("context", "invalid", &[]);
        }

        Ok(())
    }
}

fn value_is_string_map(value: &Option<Value>) -> bool {
    match value {
        None | Some(Value::Null) => true,
        Some(Value::Object(map)) => map.values().all(Value::is_string),
        _ => false,
    }
}

fn value_is_object(value: &Option<Value>) -> bool {
    matches!(value, None | Some(Value::Null) | Some(Value::Object(_)))
}
