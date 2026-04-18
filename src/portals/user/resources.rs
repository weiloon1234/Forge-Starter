use crate::domain::models::User;
use forge::prelude::*;

pub struct UserResource;

impl ApiResource<User> for UserResource {
    fn transform(user: &User) -> serde_json::Value {
        serde_json::json!({
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "created_at": user.created_at,
        })
    }
}
