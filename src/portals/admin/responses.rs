use serde::Serialize;
use ts_rs::TS;

/// Admin view of a user (includes internal fields like status).
#[derive(Serialize, TS)]
#[ts(export)]
pub struct AdminUserResponse {
    pub id: String,
    pub email: String,
    pub name: String,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}
