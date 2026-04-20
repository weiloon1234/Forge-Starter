use forge::prelude::*;
use forge::validation::file_rules::is_image;
use serde::Serialize;
use ts_rs::TS;

use crate::domain::models::Admin;
use crate::domain::services::admin_service;
use crate::ids::upload_folders::EditorUploadFolder;
use crate::portals::admin::requests::UploadEditorAssetRequest;

#[derive(Clone, Debug, Serialize, TS, forge::ApiSchema)]
#[ts(export)]
pub struct AdminEditorAssetUploadResponse {
    pub link: String,
    pub path: String,
    pub name: String,
    pub mime: Option<String>,
    #[ts(type = "number")]
    pub size_bytes: u64,
}

pub async fn upload(
    app: &AppContext,
    i18n: &I18n,
    actor: &Admin,
    req: &UploadEditorAssetRequest,
) -> Result<AdminEditorAssetUploadResponse> {
    let folder = EditorUploadFolder::parse_key(&req.folder).ok_or_else(|| {
        Error::http(
            422,
            forge::t!(i18n, "admin.editor_assets.errors.invalid_folder"),
        )
    })?;

    authorize_folder(i18n, actor, folder)?;

    if !folder.allows_kind(&req.kind) {
        return Err(Error::http(
            422,
            forge::t!(i18n, "admin.editor_assets.errors.kind_not_allowed"),
        ));
    }

    if req.kind == "image" && !is_image(&req.file).await? {
        return Err(Error::http(
            422,
            forge::t!(i18n, "admin.editor_assets.errors.image_required"),
        ));
    }

    let directory = upload_directory(folder);
    let stored = req.file.store(app, &directory).await?;
    let link = public_url(app, &stored.path).await?;

    Ok(AdminEditorAssetUploadResponse {
        link,
        path: stored.path,
        name: stored.name,
        mime: stored.content_type,
        size_bytes: stored.size,
    })
}

fn authorize_folder(i18n: &I18n, actor: &Admin, folder: EditorUploadFolder) -> Result<()> {
    let permissions = admin_service::effective_permissions(actor);
    if permissions.contains(&folder.required_permission()) {
        return Ok(());
    }

    Err(Error::http(
        403,
        forge::t!(i18n, "admin.editor_assets.errors.forbidden"),
    ))
}

fn upload_directory(folder: EditorUploadFolder) -> String {
    format!("editor/{}", folder.storage_prefix())
}

async fn public_url(app: &AppContext, path: &str) -> Result<String> {
    let storage = app.storage()?;
    storage.url(path).await
}

#[cfg(test)]
mod tests {
    use super::upload_directory;
    use crate::domain::enums::{enum_key_string, AdminType};
    use crate::domain::models::Admin;
    use crate::domain::services::admin_service;
    use crate::ids::permissions::Permission;
    use crate::ids::upload_folders::EditorUploadFolder;
    use forge::prelude::*;

    fn admin_fixture(admin_type: AdminType, permissions: Vec<Permission>) -> Admin {
        let id = ModelId::generate();

        Admin {
            id,
            username: format!("admin-{id}"),
            email: format!("admin-{id}@example.com"),
            name: format!("Admin {id}"),
            admin_type,
            password_hash: "hashed".to_string(),
            permissions: permissions.into_iter().map(enum_key_string).collect(),
            locale: "en".to_string(),
            created_at: DateTime::now(),
            updated_at: DateTime::now(),
            deleted_at: None,
        }
    }

    #[test]
    fn upload_directory_uses_folder_storage_prefix() {
        assert_eq!(
            upload_directory(EditorUploadFolder::SettingsContent),
            "editor/settings-content"
        );
    }

    #[test]
    fn developer_and_super_admin_bypass_folder_permission_checks() {
        let developer = admin_fixture(AdminType::Developer, vec![]);
        let super_admin = admin_fixture(AdminType::SuperAdmin, vec![]);

        assert!(
            admin_service::effective_permissions(&developer).contains(&Permission::SettingsManage)
        );
        assert!(admin_service::effective_permissions(&super_admin)
            .contains(&Permission::SettingsManage));
    }

    #[test]
    fn plain_admin_requires_folder_permission() {
        let actor = admin_fixture(AdminType::Admin, vec![Permission::UsersRead]);

        assert!(!admin_service::effective_permissions(&actor)
            .contains(&EditorUploadFolder::SettingsContent.required_permission()));
    }
}
