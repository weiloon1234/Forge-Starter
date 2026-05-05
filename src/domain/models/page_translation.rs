use forge::prelude::*;
use serde::Serialize;

use crate::domain::models::Page;

#[derive(Serialize, forge::Model)]
#[forge(table = "model_translations", audit = false)]
pub struct PageTranslation {
    pub id: ModelId<Self>,
    pub translatable_type: String,
    pub translatable_id: ModelId<Page>,
    pub locale: String,
    pub field: String,
    pub value: String,
    pub created_at: DateTime,
    pub updated_at: Option<DateTime>,
}
