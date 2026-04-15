use serde::Serialize;

/// Simple message response (login success, logout, etc.).
#[derive(Serialize, ts_rs::TS, forge::ApiSchema)]
#[ts(export)]
pub struct MessageResponse {
    pub message: String,
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

/// Pagination metadata.
#[derive(Serialize, ts_rs::TS, forge::TS)]
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

/// Datatable query response.
#[derive(Serialize, ts_rs::TS, forge::TS)]
#[ts(export)]
pub struct DatatableResponse {
    #[ts(type = "Record<string, any>[]")]
    pub rows: Vec<serde_json::Map<String, serde_json::Value>>,
    pub columns: Vec<DatatableColumnResponse>,
    #[ts(type = "any[]")]
    pub filters: Vec<serde_json::Value>,
    pub pagination: DatatablePaginationResponse,
    #[ts(type = "any[]")]
    pub applied_filters: Vec<serde_json::Value>,
    #[ts(type = "any[]")]
    pub sorts: Vec<serde_json::Value>,
}

/// Datatable column metadata.
#[derive(Serialize, ts_rs::TS, forge::TS)]
#[ts(export)]
pub struct DatatableColumnResponse {
    pub name: String,
    pub label: String,
    pub sortable: bool,
    pub filterable: bool,
}

/// Datatable pagination metadata.
#[derive(Serialize, ts_rs::TS, forge::TS)]
#[ts(export)]
pub struct DatatablePaginationResponse {
    #[ts(type = "number")]
    pub page: u64,
    #[ts(type = "number")]
    pub per_page: u64,
    #[ts(type = "number")]
    pub total: u64,
    #[ts(type = "number")]
    pub total_pages: u64,
}
