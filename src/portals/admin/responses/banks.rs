use serde::Serialize;
use serde_json::Value;
use ts_rs::TS;

#[derive(Clone, Debug, Serialize, TS, forge::ApiSchema)]
#[ts(export)]
pub struct AdminBankResponse {
    pub id: String,
    pub country_iso2: String,
    #[ts(type = "Record<string, string>")]
    pub name: Value,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Serialize, TS, forge::ApiSchema)]
#[ts(export)]
pub struct BankOptionResponse {
    pub id: String,
    pub country_iso2: String,
    pub name: String,
}
