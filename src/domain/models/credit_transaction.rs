use forge::prelude::*;
use serde::Serialize;

use crate::domain::enums::{CreditTransactionType, CreditType};
use crate::domain::models::User;

pub struct CreditRelatedKey;

#[derive(Serialize, forge::Model)]
#[forge(model = "credit_transactions")]
pub struct CreditTransaction {
    pub id: ModelId<Self>,
    pub user_id: ModelId<User>,
    pub credit_type: CreditType,
    pub transaction_type: CreditTransactionType,
    pub amount: Numeric,
    pub balance_before: Numeric,
    pub balance_after: Numeric,
    pub explanation_key: String,
    pub explanation_params: serde_json::Value,
    pub explanation_overrides: serde_json::Value,
    pub related_key: Option<ModelId<CreditRelatedKey>>,
    pub related_type: Option<String>,
    pub context: serde_json::Value,
    pub created_at: DateTime,
    pub updated_at: Option<DateTime>,
    #[serde(skip)]
    pub user: Loaded<Option<User>>,
}

impl CreditTransaction {
    pub fn user() -> RelationDef<Self, User> {
        belongs_to(
            Self::USER_ID,
            User::ID,
            |transaction| Some(transaction.user_id),
            |transaction, user| transaction.user = Loaded::new(user),
        )
        .named("user")
    }
}
