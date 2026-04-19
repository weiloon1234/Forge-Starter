use crate::domain::models::Admin;
use crate::domain::models::User;
use crate::domain::services::admin_service;
use forge::prelude::*;

pub struct AdminUserResource;
pub struct AdminResource;

impl ApiResource<User> for AdminUserResource {
    fn transform(user: &User) -> serde_json::Value {
        serde_json::json!({
            "id": user.id.to_string(),
            "introducer_user_id": user.introducer_user_id.map(|id| id.to_string()),
            "username": user.username.clone(),
            "email": user.email.clone(),
            "name": user.name.clone(),
            "country_iso2": user.country_iso2.clone(),
            "contact_country_iso2": user.contact_country_iso2.clone(),
            "contact_number": user.contact_number.clone(),
            "credit_1": user.credit_1.to_string(),
            "credit_2": user.credit_2.to_string(),
            "credit_3": user.credit_3.to_string(),
            "credit_4": user.credit_4.to_string(),
            "credit_5": user.credit_5.to_string(),
            "credit_6": user.credit_6.to_string(),
            "created_at": user.created_at.to_string(),
            "updated_at": user.updated_at.to_string(),
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
