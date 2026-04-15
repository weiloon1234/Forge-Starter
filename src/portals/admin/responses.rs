use serde::Serialize;
use ts_rs::TS;

use crate::domain::enums::AdminType;
use crate::domain::models::Admin;

/// Admin view of a user (includes internal fields like status).
#[derive(Serialize, TS, forge::ApiSchema)]
#[ts(export)]
pub struct AdminUserResponse {
    pub id: String,
    pub email: String,
    pub name: String,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

/// Admin's own profile (returned by /admin/auth/me).
#[derive(Serialize, TS, forge::ApiSchema)]
#[ts(export)]
pub struct AdminMeResponse {
    pub id: String,
    pub username: String,
    pub email: String,
    pub name: String,
    pub admin_type: AdminType,
    pub locale: String,
}

impl From<&Admin> for AdminMeResponse {
    fn from(admin: &Admin) -> Self {
        Self {
            id: admin.id.to_string(),
            username: admin.username.clone(),
            email: admin.email.clone(),
            name: admin.name.clone(),
            admin_type: admin.admin_type.clone(),
            locale: admin.locale.clone(),
        }
    }
}
