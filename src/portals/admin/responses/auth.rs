use serde::Serialize;
use ts_rs::TS;

use crate::domain::enums::AdminType;
use crate::domain::models::Admin;
use crate::domain::services::admin_service;
use crate::ids::permissions::Permission;

/// Admin's own profile (returned by /admin/auth/me).
#[derive(Serialize, TS, forge::ApiSchema)]
#[ts(export)]
pub struct AdminMeResponse {
    pub id: String,
    pub username: String,
    pub email: String,
    pub name: String,
    #[ts(type = "import(\"./AdminType\").AdminType")]
    pub admin_type: AdminType,
    #[ts(type = "Array<import(\"./Permission\").Permission>")]
    pub abilities: Vec<Permission>,
    pub locale: String,
}

impl AdminMeResponse {
    pub fn from_admin(admin: &Admin) -> Self {
        Self {
            id: admin.id.to_string(),
            username: admin.username.clone(),
            email: admin.email.clone(),
            name: admin.name.clone(),
            admin_type: admin.admin_type,
            abilities: admin_service::effective_permissions(admin),
            locale: admin.locale.clone(),
        }
    }
}
