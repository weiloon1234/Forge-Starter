use serde::Serialize;
use ts_rs::TS;

/// Public user profile (user-facing, minimal fields).
#[derive(Serialize, TS, forge::ApiSchema)]
#[ts(export)]
pub struct UserResponse {
    pub id: String,
    pub email: String,
    pub name: String,
    pub created_at: String,
}
