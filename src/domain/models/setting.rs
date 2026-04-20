use forge::prelude::*;
use forge::settings::SettingType;
use serde::Serialize;

#[derive(Serialize, forge::Model)]
#[forge(model = "settings")]
pub struct AppSetting {
    pub id: ModelId<Self>,
    pub key: String,
    pub value: Option<serde_json::Value>,
    pub setting_type: SettingType,
    pub parameters: serde_json::Value,
    pub group_name: String,
    pub label: String,
    pub description: Option<String>,
    pub sort_order: i32,
    pub is_public: bool,
    pub created_at: DateTime,
    pub updated_at: Option<DateTime>,
}
