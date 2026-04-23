use serde::Serialize;
use serde_json::Value;
use ts_rs::TS;

use crate::domain::enums::{CreditTransactionType, CreditType};

#[derive(Clone, Debug, Serialize, TS, forge::ApiSchema)]
#[ts(export)]
pub struct AdminCreditAdjustmentResponse {
    pub id: String,
    pub credit_transaction_id: String,
    pub user_id: String,
    pub user_label: String,
    #[ts(type = "import(\"./CreditType\").CreditType")]
    pub credit_type: CreditType,
    #[ts(type = "import(\"./CreditTransactionType\").CreditTransactionType")]
    pub transaction_type: CreditTransactionType,
    pub amount: String,
    pub balance_before: String,
    pub balance_after: String,
    pub explanation_key: String,
    #[ts(type = "Record<string, unknown>")]
    pub explanation_params: Value,
    #[ts(type = "Record<string, string>")]
    pub explanation_overrides: Value,
    pub explanation_text: String,
    pub related_key: Option<String>,
    pub related_type: Option<String>,
    #[ts(type = "Record<string, unknown>")]
    pub context: Value,
    pub admin_id: String,
    pub admin_label: String,
    pub remark: Option<String>,
    pub created_at: String,
    pub updated_at: Option<String>,
}
