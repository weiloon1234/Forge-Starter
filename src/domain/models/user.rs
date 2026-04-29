use async_trait::async_trait;
use serde::Serialize;

use forge::prelude::*;

use crate::domain::models::Country;
use crate::ids::guards::Guard;

pub struct UserLifecycle;

#[derive(Serialize, forge::Model)]
#[forge(model = "users", soft_deletes = true, lifecycle = UserLifecycle)]
pub struct User {
    pub id: ModelId<Self>,
    pub username: Option<String>,
    pub name: Option<String>,
    pub email: Option<String>,
    pub introducer_user_id: Option<ModelId<Self>>,
    pub country_iso2: Option<String>,
    pub contact_country_iso2: Option<String>,
    pub contact_number: Option<String>,
    pub credit_1: Numeric,
    pub credit_2: Numeric,
    pub credit_3: Numeric,
    pub credit_4: Numeric,
    pub credit_5: Numeric,
    pub credit_6: Numeric,
    #[serde(skip)]
    #[forge(write_mutator = "hash_secret", audit_exclude)]
    pub password_hash: String,
    #[serde(skip)]
    #[forge(write_mutator = "hash_secret", audit_exclude)]
    pub password2_hash: String,
    pub created_at: DateTime,
    pub updated_at: DateTime,
    pub deleted_at: Option<DateTime>,
    #[serde(skip)]
    pub introducer: Loaded<Option<Box<User>>>,
    #[serde(skip)]
    pub country: Loaded<Option<Country>>,
    #[serde(skip)]
    pub contact_country: Loaded<Option<Country>>,
}

impl User {
    pub const ORIGIN_USERNAME: &'static str = "origin";

    async fn hash_secret(ctx: &ModelHookContext<'_>, value: String) -> Result<String> {
        ctx.app().hash()?.hash(&value)
    }

    async fn assign_default_introducer(
        ctx: &ModelHookContext<'_>,
        draft: &mut CreateDraft<Self>,
    ) -> Result<()> {
        if draft.assigned_columns().contains(&"introducer_user_id") {
            return Ok(());
        }

        if draft
            .pending_record()
            .optional_text("username")
            .as_deref()
            .is_some_and(|username| username.eq_ignore_ascii_case(Self::ORIGIN_USERNAME))
        {
            return Ok(());
        }

        let mut introducer = Self::model_query()
            .where_(Condition::and([
                Self::USERNAME.ieq(Self::ORIGIN_USERNAME),
                Self::INTRODUCER_USER_ID.is_null(),
            ]))
            .order_by(Self::CREATED_AT.asc())
            .first(ctx.transaction())
            .await?;

        if introducer.is_none() {
            introducer = Self::model_query()
                .where_(Self::INTRODUCER_USER_ID.is_null())
                .order_by(Self::CREATED_AT.asc())
                .first(ctx.transaction())
                .await?;
        }

        let Some(introducer) = introducer else {
            return Err(Error::message(
                "origin user must exist before creating introduced users",
            ));
        };

        draft.set(Self::INTRODUCER_USER_ID, Some(introducer.id));
        Ok(())
    }

    pub async fn find_active_by_login<E>(executor: &E, login: &str) -> Result<Option<Self>>
    where
        E: QueryExecutor,
    {
        let login = login.trim();

        Self::model_query()
            .where_(Condition::or([
                Condition::and([Self::USERNAME.is_not_null(), Self::USERNAME.ieq(login)]),
                Condition::and([Self::EMAIL.is_not_null(), Self::EMAIL.ieq(login)]),
            ]))
            .order_by(Self::CREATED_AT.desc())
            .first(executor)
            .await
    }

    pub fn introducer() -> RelationDef<Self, Self> {
        let foreign_key: Column<Self, ModelId<Self>> =
            Column::new("users", "introducer_user_id", DbType::Uuid);

        belongs_to(
            foreign_key,
            Self::ID,
            |user| user.introducer_user_id,
            |user, introducer| user.introducer = Loaded::new(introducer.map(Box::new)),
        )
        .named("introducer")
    }

    pub fn country() -> RelationDef<Self, Country> {
        let foreign_key: Column<Self, String> = Column::new("users", "country_iso2", DbType::Text);

        belongs_to(
            foreign_key,
            Country::ISO2,
            |user| user.country_iso2.clone(),
            |user, country| user.country = Loaded::new(country),
        )
        .named("country")
    }

    pub fn contact_country() -> RelationDef<Self, Country> {
        let foreign_key: Column<Self, String> =
            Column::new("users", "contact_country_iso2", DbType::Text);

        belongs_to(
            foreign_key,
            Country::ISO2,
            |user| user.contact_country_iso2.clone(),
            |user, country| user.contact_country = Loaded::new(country),
        )
        .named("contact_country")
    }
}

#[async_trait]
impl ModelLifecycle<User> for UserLifecycle {
    async fn creating(ctx: &ModelHookContext<'_>, draft: &mut CreateDraft<User>) -> Result<()> {
        User::assign_default_introducer(ctx, draft).await
    }
}

impl Authenticatable for User {
    fn guard() -> GuardId {
        Guard::User.into()
    }
}

impl HasToken for User {
    fn token_actor_id(&self) -> String {
        self.id.to_string()
    }
}
