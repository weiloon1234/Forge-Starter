pub mod app_enum;

use serde::Serialize;

/// Simple health/status response shape.
#[derive(Debug, Serialize, ts_rs::TS, forge::ApiSchema)]
#[ts(export)]
pub struct StatusResponse {
    pub status: String,
}

impl StatusResponse {
    pub fn ok() -> Self {
        Self {
            status: "ok".to_string(),
        }
    }
}

/// Forge API error response shape (422 validation, 4xx/5xx errors).
#[derive(Serialize, ts_rs::TS, forge::TS)]
#[ts(export)]
pub struct ApiError {
    pub message: String,
    pub status: u16,
    #[ts(optional)]
    pub error_code: Option<String>,
    #[ts(optional)]
    pub message_key: Option<String>,
    #[ts(optional)]
    pub errors: Option<Vec<FieldError>>,
}

/// Individual field validation error.
#[derive(Serialize, ts_rs::TS, forge::TS)]
#[ts(export)]
pub struct FieldError {
    pub field: String,
    pub code: String,
    pub message: String,
}
