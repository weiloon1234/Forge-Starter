use async_trait::async_trait;
use forge::prelude::*;

use crate::domain::enums::UserStatus;
use crate::ids::guards::Guard;

#[derive(Serialize, forge::Model)]
#[forge(model = "users")]
pub struct User {
    pub id: ModelId<Self>,
    pub email: String,
    pub name: String,
    #[serde(skip)]
    #[forge(write_mutator = "hash_password")]
    pub password_hash: String,
    pub status: UserStatus,
    pub created_at: DateTime,
    pub updated_at: DateTime,
}

impl User {
    async fn hash_password(ctx: &ModelHookContext<'_>, value: String) -> Result<String> {
        ctx.app().hash()?.hash(&value)
    }
}

#[async_trait]
impl Authenticatable for User {
    fn guard() -> GuardId {
        Guard::User.into()
    }

    async fn resolve_from_actor<E: QueryExecutor>(
        actor: &Actor,
        executor: &E,
    ) -> Result<Option<Self>> {
        let id: ModelId<Self> = actor.id.parse().map_err(|_| Error::message("invalid actor id"))?;
        User::model_query()
            .where_(User::ID.eq(id))
            .first(executor)
            .await
    }
}

impl HasToken for User {
    fn token_actor_id(&self) -> String {
        self.id.to_string()
    }
}
