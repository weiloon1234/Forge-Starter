use serde::Serialize;
use ts_rs::TS;

use crate::domain::enums::AdminType;
use crate::domain::enums::UserStatus;
use crate::domain::models::Admin;
use crate::domain::services::admin_service;
use crate::domain::services::log_service::{LogEntry, LogFileInfo};
use crate::ids::permissions::Permission;

/// Admin view of a user (includes internal fields like status).
#[derive(Serialize, TS, forge::ApiSchema)]
#[ts(export)]
pub struct AdminUserResponse {
    pub id: String,
    pub email: String,
    pub name: String,
    pub status: UserStatus,
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

#[derive(Serialize, TS, forge::ApiSchema)]
#[ts(export)]
pub struct AdminResponse {
    pub id: String,
    pub username: String,
    pub email: String,
    pub name: String,
    pub admin_type: AdminType,
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
    pub permission: Permission,
    pub grantable: bool,
}

#[derive(Serialize, TS, forge::ApiSchema)]
#[ts(export)]
pub struct LogFileResponse {
    pub filename: String,
    pub size_bytes: u64,
    pub modified_at_epoch: u64,
}

impl From<&LogFileInfo> for LogFileResponse {
    fn from(f: &LogFileInfo) -> Self {
        Self {
            filename: f.filename.clone(),
            size_bytes: f.size_bytes,
            modified_at_epoch: f.modified_at_epoch,
        }
    }
}

#[derive(Serialize, TS, forge::ApiSchema)]
#[ts(export)]
pub struct LogEntryResponse {
    pub timestamp: String,
    pub level: String,
    pub message: String,
    pub target: Option<String>,
    #[ts(type = "Record<string, unknown>")]
    pub raw: serde_json::Value,
}

impl From<LogEntry> for LogEntryResponse {
    fn from(e: LogEntry) -> Self {
        Self {
            timestamp: e.timestamp,
            level: e.level,
            message: e.message,
            target: e.target,
            raw: e.raw,
        }
    }
}
