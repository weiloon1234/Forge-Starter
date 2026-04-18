use forge::Validate;
use serde::Deserialize;

#[derive(Debug, Deserialize, ts_rs::TS, forge::ApiSchema, Validate)]
#[ts(export)]
pub struct LoginRequest {
    #[validate(required, email)]
    pub email: String,
    #[validate(required)]
    pub password: String,
}

#[derive(Debug, Deserialize, ts_rs::TS, forge::ApiSchema, Validate)]
#[ts(export)]
pub struct UpdateProfileRequest {
    #[validate(required, min(2), max(100))]
    pub name: String,
}
