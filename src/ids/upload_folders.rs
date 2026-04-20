use crate::ids::permissions::Permission;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, forge::AppEnum)]
pub enum EditorUploadFolder {
    #[forge(key = "settings.content")]
    SettingsContent,
    #[forge(key = "pages.content")]
    PagesContent,
}

impl EditorUploadFolder {
    pub const fn required_permission(self) -> Permission {
        match self {
            Self::SettingsContent => Permission::SettingsManage,
            Self::PagesContent => Permission::PagesManage,
        }
    }

    pub const fn storage_prefix(self) -> &'static str {
        match self {
            Self::SettingsContent => "settings-content",
            Self::PagesContent => "pages-content",
        }
    }

    pub fn allows_kind(self, kind: &str) -> bool {
        match self {
            Self::SettingsContent => matches!(kind, "file" | "image"),
            Self::PagesContent => matches!(kind, "file" | "image"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::EditorUploadFolder;
    use crate::ids::permissions::Permission;

    #[test]
    fn settings_content_maps_to_settings_manage() {
        assert_eq!(
            EditorUploadFolder::SettingsContent.required_permission(),
            Permission::SettingsManage
        );
    }

    #[test]
    fn settings_content_accepts_file_and_image_kinds() {
        assert!(EditorUploadFolder::SettingsContent.allows_kind("file"));
        assert!(EditorUploadFolder::SettingsContent.allows_kind("image"));
        assert!(!EditorUploadFolder::SettingsContent.allows_kind("video"));
    }

    #[test]
    fn pages_content_maps_to_pages_manage() {
        assert_eq!(
            EditorUploadFolder::PagesContent.required_permission(),
            Permission::PagesManage
        );
    }
}
