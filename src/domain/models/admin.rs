use async_trait::async_trait;
use forge::prelude::*;

use crate::domain::enums::AdminType;
use crate::ids::guards::Guard;

#[derive(forge::Model)]
#[forge(model = "admins")]
pub struct Admin {
    pub id: ModelId<Self>,
    pub username: String,
    pub email: String,
    pub name: String,
    pub admin_type: AdminType,
    #[forge(write_mutator = "hash_password")]
    pub password_hash: String,
    pub locale: String,
    pub created_at: DateTime,
    pub updated_at: DateTime,
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

#[async_trait]
impl Authenticatable for Admin {
    fn guard() -> GuardId {
        Guard::Admin.into()
    }

    async fn resolve_from_actor<E: QueryExecutor>(
        actor: &Actor,
        executor: &E,
    ) -> Result<Option<Self>> {
        let id: ModelId<Self> = actor.id.parse().map_err(|_| Error::message("invalid actor id"))?;
        Admin::model_query()
            .where_(Admin::ID.eq(id))
            .first(executor)
            .await
    }
}
