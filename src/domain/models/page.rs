use forge::prelude::*;
use serde::Serialize;

use crate::domain::models::PageTranslation;

#[derive(Serialize, forge::Model)]
#[forge(model = "pages")]
pub struct Page {
    pub id: ModelId<Self>,
    pub slug: String,
    pub is_system: bool,
    pub created_at: DateTime,
    pub updated_at: Option<DateTime>,
    #[serde(skip_serializing, skip_deserializing)]
    pub title_translation: Loaded<Option<PageTranslation>>,
}

impl Page {
    pub fn title_translation(locale: &str) -> RelationDef<Self, PageTranslation> {
        has_one(
            Self::ID,
            PageTranslation::TRANSLATABLE_ID,
            |page| page.id,
            |page, translation| page.title_translation = Loaded::new(translation),
        )
        .where_(PageTranslation::TRANSLATABLE_TYPE.eq(Self::translatable_type()))
        .where_(PageTranslation::LOCALE.eq(locale))
        .where_(PageTranslation::FIELD.eq("title"))
    }

    pub fn default_title(&self) -> Option<&str> {
        self.title_translation
            .as_ref()
            .and_then(|translation| translation.as_ref())
            .map(|translation| translation.value.as_str())
    }
}

#[async_trait::async_trait]
impl HasTranslations for Page {
    fn translatable_type() -> &'static str {
        "pages"
    }

    fn translatable_id(&self) -> String {
        self.id.to_string()
    }
}

#[async_trait::async_trait]
impl HasAttachments for Page {
    fn attachable_type() -> &'static str {
        "pages"
    }

    fn attachable_id(&self) -> String {
        self.id.to_string()
    }
}
