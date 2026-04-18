use serde::Serialize;

use forge::prelude::*;

use crate::domain::enums::AdminType;
use crate::ids::guards::Guard;

#[derive(Serialize, forge::Model)]
#[forge(model = "admins", soft_deletes = true)]
pub struct Admin {
    pub id: ModelId<Self>,
    pub username: String,
    pub email: String,
    pub name: String,
    pub admin_type: AdminType,
    pub permissions: Vec<String>,
    #[forge(write_mutator = "hash_password")]
    pub password_hash: String,
    pub locale: String,
    pub created_at: DateTime,
    pub updated_at: DateTime,
    pub deleted_at: Option<DateTime>,
}

impl Admin {
    async fn hash_password(ctx: &ModelHookContext<'_>, value: String) -> Result<String> {
        ctx.app().hash()?.hash(&value)
    }
}

impl HasToken for Admin {
    fn token_actor_id(&self) -> String {
        self.id.to_string()
    }
}

impl Authenticatable for Admin {
    fn guard() -> GuardId {
        Guard::Admin.into()
    }
}
