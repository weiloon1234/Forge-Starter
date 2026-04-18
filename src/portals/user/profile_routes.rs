use crate::domain::models::User;
use crate::portals::user::requests::UpdateProfileRequest;
use crate::portals::user::resources::UserResource;
use crate::validation::JsonValidated;
use forge::prelude::*;

pub async fn show(AuthenticatedModel(user): Auth<User>) -> impl IntoResponse {
    Json(UserResource::make(&user))
}

pub async fn update(
    State(app): State<AppContext>,
    AuthenticatedModel(user): Auth<User>,
    JsonValidated(req): JsonValidated<UpdateProfileRequest>,
) -> Result<impl IntoResponse> {
    let updated = user
        .update()
        .set(User::NAME, req.name.as_str())
        .save(&app)
        .await?;
    Ok(Json(UserResource::make(&updated)))
}
