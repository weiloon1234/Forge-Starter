use forge::prelude::*;
use serde::Serialize;

use crate::domain::models::{Admin, CreditTransaction};

#[derive(Serialize, forge::Model)]
#[forge(model = "admin_credit_adjustments")]
pub struct AdminCreditAdjustment {
    pub id: ModelId<Self>,
    pub credit_transaction_id: ModelId<CreditTransaction>,
    pub admin_id: ModelId<Admin>,
    pub remark: Option<String>,
    pub created_at: DateTime,
    pub updated_at: Option<DateTime>,
    #[serde(skip)]
    pub admin: Loaded<Option<Admin>>,
    #[serde(skip)]
    pub credit_transaction: Loaded<Option<CreditTransaction>>,
}

impl AdminCreditAdjustment {
    pub fn admin() -> RelationDef<Self, Admin> {
        belongs_to(
            Self::ADMIN_ID,
            Admin::ID,
            |adjustment| Some(adjustment.admin_id),
            |adjustment, admin| adjustment.admin = Loaded::new(admin),
        )
        .named("admin")
    }

    pub fn credit_transaction() -> RelationDef<Self, CreditTransaction> {
        belongs_to(
            Self::CREDIT_TRANSACTION_ID,
            CreditTransaction::ID,
            |adjustment| Some(adjustment.credit_transaction_id),
            |adjustment, transaction| adjustment.credit_transaction = Loaded::new(transaction),
        )
        .named("credit_transaction")
    }
}
