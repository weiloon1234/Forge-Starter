use serde::Serialize;

use forge::prelude::*;

#[derive(Serialize, forge::Model)]
#[forge(table = "banks", soft_deletes = true)]
pub struct Bank {
    pub id: ModelId<Self>,
    pub country_iso2: String,
    pub created_at: DateTime,
    pub updated_at: DateTime,
    pub deleted_at: Option<DateTime>,
}

#[async_trait::async_trait]
impl HasTranslations for Bank {
    fn translatable_type() -> &'static str {
        "banks"
    }

    fn translatable_id(&self) -> String {
        self.id.to_string()
    }
}

impl Bank {
    pub async fn localized_name(&self, app: &AppContext) -> Result<String> {
        let translated = self.translated_field(app, "name").await?;
        Ok(translated.translated)
    }
}
