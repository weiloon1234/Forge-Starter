//! Shared app-owned domain enums.
//!
//! Keep an enum here when it crosses boundaries in this app, such as DB-backed
//! model fields, service logic, request/response DTOs, or generated frontend
//! types. Keep Forge-owned enums imported from Forge directly, and keep
//! file-private helper enums local to their module.

pub mod admin_type;
pub mod credit_adjustment_operation;
pub mod credit_transaction_type;
pub mod credit_type;
pub use admin_type::AdminType;
pub use credit_adjustment_operation::CreditAdjustmentOperation;
pub use credit_transaction_type::CreditTransactionType;
pub use credit_type::CreditType;

use forge::app_enum::{EnumKey, ForgeAppEnum};

pub fn enum_key_string<E: ForgeAppEnum>(value: E) -> String {
    match value.key() {
        EnumKey::String(value) => value,
        EnumKey::Int(value) => value.to_string(),
    }
}

pub fn enum_variants<E: ForgeAppEnum>() -> Vec<E> {
    E::keys()
        .into_iter()
        .filter_map(|key| match key {
            EnumKey::String(value) => E::parse_key(&value),
            EnumKey::Int(value) => E::parse_key(&value.to_string()),
        })
        .collect()
}
