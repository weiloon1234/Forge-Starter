use serde::Serialize;
use ts_rs::TS;

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
