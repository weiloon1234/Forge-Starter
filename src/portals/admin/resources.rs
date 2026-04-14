use forge::prelude::*;
use crate::domain::models::User;

pub struct AdminUserResource;

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
