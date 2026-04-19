use crate::domain::models::User;
use crate::domain::services::user_service;
use crate::portals::user::requests::UpdateProfileRequest;
use crate::portals::user::resources::UserResource;
use crate::validation::JsonValidated;
use forge::prelude::*;

pub async fn show(AuthenticatedModel(user): Auth<User>) -> impl IntoResponse {
    Json(UserResource::make(&user))
}

pub async fn update(
    State(app): State<AppContext>,
    i18n: I18n,
    AuthenticatedModel(user): Auth<User>,
    JsonValidated(req): JsonValidated<UpdateProfileRequest>,
) -> Result<impl IntoResponse> {
    let updated = user_service::update_profile(&app, &i18n, &user, &req).await?;
    Ok(Json(UserResource::make(&updated)))
}
