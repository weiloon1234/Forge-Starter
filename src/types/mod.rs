use serde::Serialize;
use ts_rs::TS;

/// Forge API error response shape (422 validation, 4xx/5xx errors).
#[derive(Serialize, TS)]
#[ts(export)]
pub struct ApiError {
    pub message: String,
    pub status: u16,
    #[ts(optional)]
    pub error_code: Option<String>,
    #[ts(optional)]
    pub errors: Option<Vec<FieldError>>,
}

/// Individual field validation error.
#[derive(Serialize, TS)]
#[ts(export)]
pub struct FieldError {
    pub field: String,
    pub code: String,
    pub message: String,
}

/// Token pair response from Forge auth.
#[derive(Serialize, TS)]
#[ts(export)]
pub struct TokenPair {
    pub access_token: String,
    pub refresh_token: String,
    #[ts(type = "number")]
    pub expires_in: u64,
    pub token_type: String,
}

/// Pagination metadata.
#[derive(Serialize, TS)]
#[ts(export)]
pub struct PaginationMeta {
    #[ts(type = "number")]
    pub current_page: u64,
    #[ts(type = "number")]
    pub per_page: u64,
    #[ts(type = "number")]
    pub total: u64,
    #[ts(type = "number")]
    pub last_page: u64,
}
