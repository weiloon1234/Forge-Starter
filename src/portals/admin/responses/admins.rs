use serde::Serialize;
use ts_rs::TS;

use crate::domain::enums::AdminType;
use crate::domain::models::Admin;
use crate::domain::services::admin_service;
use crate::ids::permissions::Permission;

#[derive(Serialize, TS, forge::ApiSchema)]
#[ts(export)]
pub struct AdminResponse {
    pub id: String,
    pub username: String,
    pub email: String,
    pub name: String,
    #[ts(type = "import(\"./AdminType\").AdminType")]
    pub admin_type: AdminType,
    #[ts(type = "Array<import(\"./Permission\").Permission>")]
    pub permissions: Vec<Permission>,
    pub locale: String,
    pub created_at: String,
    pub updated_at: String,
}

impl From<&Admin> for AdminResponse {
    fn from(admin: &Admin) -> Self {
        Self {
            id: admin.id.to_string(),
            username: admin.username.clone(),
            email: admin.email.clone(),
            name: admin.name.clone(),
            admin_type: admin.admin_type,
            permissions: admin_service::assigned_permissions(admin),
            locale: admin.locale.clone(),
            created_at: admin.created_at.to_string(),
            updated_at: admin.updated_at.to_string(),
        }
    }
}

#[derive(Serialize, TS, forge::ApiSchema)]
#[ts(export)]
pub struct AdminPermissionResponse {
    #[ts(type = "import(\"./Permission\").Permission")]
    pub permission: Permission,
    pub grantable: bool,
}
