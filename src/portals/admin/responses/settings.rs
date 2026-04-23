use forge::settings::SettingType;
use serde::ser::SerializeStruct;
use serde::{Deserialize, Serialize, Serializer};
use serde_json::Value;
use ts_rs::TS;

#[derive(Clone, Debug, Deserialize, TS, forge::ApiSchema, PartialEq)]
#[ts(export)]
pub struct AdminSettingAssetResponse {
    pub disk: String,
    pub path: String,
    pub name: String,
    #[ts(optional)]
    pub mime: Option<String>,
    #[ts(type = "number")]
    pub size_bytes: u64,
    #[ts(optional)]
    pub width: Option<u32>,
    #[ts(optional)]
    pub height: Option<u32>,
    #[ts(optional)]
    pub preview_url: Option<String>,
    #[ts(optional)]
    pub download_url: Option<String>,
}

impl Serialize for AdminSettingAssetResponse {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let field_count = 4
            + usize::from(self.mime.is_some())
            + usize::from(self.width.is_some())
            + usize::from(self.height.is_some())
            + usize::from(self.preview_url.is_some())
            + usize::from(self.download_url.is_some());
        let mut state = serializer.serialize_struct("AdminSettingAssetResponse", field_count)?;

        state.serialize_field("disk", &self.disk)?;
        state.serialize_field("path", &self.path)?;
        state.serialize_field("name", &self.name)?;
        state.serialize_field("size_bytes", &self.size_bytes)?;

        if let Some(value) = &self.mime {
            state.serialize_field("mime", value)?;
        }
        if let Some(value) = self.width {
            state.serialize_field("width", &value)?;
        }
        if let Some(value) = self.height {
            state.serialize_field("height", &value)?;
        }
        if let Some(value) = &self.preview_url {
            state.serialize_field("preview_url", value)?;
        }
        if let Some(value) = &self.download_url {
            state.serialize_field("download_url", value)?;
        }

        state.end()
    }
}

#[derive(Clone, Debug, Serialize, TS, forge::ApiSchema)]
#[ts(export)]
pub struct AdminSettingResponse {
    pub key: String,
    pub label: String,
    pub description: Option<String>,
    pub group_name: String,
    #[ts(type = "import(\"./SettingType\").SettingType")]
    pub setting_type: SettingType,
    #[ts(type = "Record<string, unknown>")]
    pub parameters: Value,
    pub is_public: bool,
    #[ts(type = "unknown")]
    pub value: Value,
    pub updated_at: Option<String>,
    pub asset: Option<AdminSettingAssetResponse>,
}
