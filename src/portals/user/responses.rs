use serde::Serialize;
use ts_rs::TS;

/// Public user profile (user-facing, minimal fields).
#[derive(Serialize, TS, forge::ApiSchema)]
#[ts(export)]
pub struct UserResponse {
    pub id: String,
    pub username: Option<String>,
    pub name: Option<String>,
    pub email: Option<String>,
    pub country_iso2: Option<String>,
    pub contact_country_iso2: Option<String>,
    pub contact_number: Option<String>,
    pub created_at: String,
}
