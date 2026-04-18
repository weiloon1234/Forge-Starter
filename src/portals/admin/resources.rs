use crate::domain::models::Admin;
use crate::domain::models::User;
use crate::domain::services::admin_service;
use forge::prelude::*;

pub struct AdminUserResource;
pub struct AdminResource;

impl ApiResource<User> for AdminUserResource {
    fn transform(user: &User) -> serde_json::Value {
        serde_json::json!({
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "status": user.status,
            "created_at": user.created_at,
            "updated_at": user.updated_at,
        })
    }
}

impl ApiResource<Admin> for AdminResource {
    fn transform(admin: &Admin) -> serde_json::Value {
        serde_json::json!({
            "id": admin.id,
            "username": admin.username,
            "email": admin.email,
            "name": admin.name,
            "admin_type": admin.admin_type,
            "permissions": admin_service::assigned_permissions(admin),
            "locale": admin.locale,
            "created_at": admin.created_at.to_string(),
            "updated_at": admin.updated_at.to_string(),
        })
    }
}
