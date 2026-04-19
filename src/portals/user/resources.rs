use crate::domain::models::User;
use forge::prelude::*;

pub struct UserResource;

impl ApiResource<User> for UserResource {
    fn transform(user: &User) -> serde_json::Value {
        serde_json::json!({
            "id": user.id.to_string(),
            "username": user.username.clone(),
            "name": user.name.clone(),
            "email": user.email.clone(),
            "country_iso2": user.country_iso2.clone(),
            "contact_country_iso2": user.contact_country_iso2.clone(),
            "contact_number": user.contact_number.clone(),
            "created_at": user.created_at.to_string(),
        })
    }
}
