#[test]
fn export_typescript_bindings() {
    use ts_rs::TS;

    // Framework types
    forge_starter::types::ApiError::export_all().unwrap();
    forge_starter::types::TokenPair::export_all().unwrap();
    forge_starter::types::PaginationMeta::export_all().unwrap();

    // Enums
    forge_starter::domain::enums::UserStatus::export_all().unwrap();

    // Request DTOs
    forge_starter::portals::admin::requests::AdminLoginRequest::export_all().unwrap();
    forge_starter::portals::admin::requests::UpdateAdminProfileRequest::export_all().unwrap();
    forge_starter::portals::admin::requests::ChangeAdminPasswordRequest::export_all().unwrap();
    forge_starter::portals::user::requests::LoginRequest::export_all().unwrap();
    forge_starter::portals::user::requests::UpdateProfileRequest::export_all().unwrap();

    // Response DTOs
    forge_starter::portals::admin::responses::AdminUserResponse::export_all().unwrap();
    forge_starter::portals::admin::responses::AdminMeResponse::export_all().unwrap();
    forge_starter::portals::user::responses::UserResponse::export_all().unwrap();

    // Enums
    forge_starter::domain::enums::AdminType::export_all().unwrap();

    // Datatable types
    forge_starter::types::DatatableResponse::export_all().unwrap();
    forge_starter::types::DatatableColumnResponse::export_all().unwrap();
    forge_starter::types::DatatablePaginationResponse::export_all().unwrap();
}
