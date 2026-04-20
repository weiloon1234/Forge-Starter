use forge::prelude::*;

use crate::domain::models::Admin;
use crate::domain::services::editor_asset_service;
use crate::portals::admin::requests::UploadEditorAssetRequest;

pub async fn upload(
    State(app): State<AppContext>,
    i18n: I18n,
    AuthenticatedModel(actor): Auth<Admin>,
    form: MultipartForm,
) -> Result<impl IntoResponse> {
    let req = UploadEditorAssetRequest::from_multipart(&i18n, form)?;

    Ok(Json(
        editor_asset_service::upload(&app, &i18n, &actor, &req).await?,
    ))
}
