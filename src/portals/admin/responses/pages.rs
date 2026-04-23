use serde::ser::SerializeStruct;
use serde::{Serialize, Serializer};
use serde_json::Value;
use ts_rs::TS;

#[derive(Clone, Debug, TS, forge::ApiSchema)]
#[ts(export)]
pub struct PageCoverResponse {
    pub id: String,
    pub name: String,
    #[ts(optional)]
    pub mime_type: Option<String>,
    #[ts(type = "number")]
    pub size_bytes: u64,
    pub url: String,
}

impl Serialize for PageCoverResponse {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let field_count = 4 + usize::from(self.mime_type.is_some());
        let mut state = serializer.serialize_struct("PageCoverResponse", field_count)?;

        state.serialize_field("id", &self.id)?;
        state.serialize_field("name", &self.name)?;
        state.serialize_field("size_bytes", &self.size_bytes)?;
        state.serialize_field("url", &self.url)?;

        if let Some(value) = &self.mime_type {
            state.serialize_field("mime_type", value)?;
        }

        state.end()
    }
}

#[derive(Clone, Debug, Serialize, TS, forge::ApiSchema)]
#[ts(export)]
pub struct AdminPageResponse {
    pub id: String,
    pub slug: String,
    pub is_system: bool,
    #[ts(type = "Record<string, string>")]
    pub title: Value,
    #[ts(type = "Record<string, string>")]
    pub content: Value,
    pub cover: Option<PageCoverResponse>,
    pub created_at: String,
    pub updated_at: Option<String>,
}
