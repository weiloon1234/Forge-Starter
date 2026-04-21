use forge::prelude::*;
use serde::Serialize;

use crate::domain::models::{Admin, User};

#[derive(Serialize, forge::Model)]
#[forge(model = "admin_user_introducer_changes")]
pub struct AdminUserIntroducerChange {
    pub id: ModelId<Self>,
    pub admin_id: ModelId<Admin>,
    pub admin_username: String,
    pub user_id: ModelId<User>,
    pub user_username: Option<String>,
    pub from_introducer_user_id: ModelId<User>,
    pub from_introducer_username: Option<String>,
    pub to_introducer_user_id: ModelId<User>,
    pub to_introducer_username: Option<String>,
    pub created_at: DateTime,
    pub updated_at: Option<DateTime>,
    #[serde(skip)]
    pub admin: Loaded<Option<Admin>>,
    #[serde(skip)]
    pub user: Loaded<Option<User>>,
    #[serde(skip)]
    pub from_introducer: Loaded<Option<User>>,
    #[serde(skip)]
    pub to_introducer: Loaded<Option<User>>,
}

impl AdminUserIntroducerChange {
    pub fn admin() -> RelationDef<Self, Admin> {
        belongs_to(
            Self::ADMIN_ID,
            Admin::ID,
            |change| Some(change.admin_id),
            |change, admin| change.admin = Loaded::new(admin),
        )
        .named("admin")
    }

    pub fn user() -> RelationDef<Self, User> {
        belongs_to(
            Self::USER_ID,
            User::ID,
            |change| Some(change.user_id),
            |change, user| change.user = Loaded::new(user),
        )
        .named("user")
    }

    pub fn from_introducer() -> RelationDef<Self, User> {
        belongs_to(
            Self::FROM_INTRODUCER_USER_ID,
            User::ID,
            |change| Some(change.from_introducer_user_id),
            |change, user| change.from_introducer = Loaded::new(user),
        )
        .named("from_introducer")
    }

    pub fn to_introducer() -> RelationDef<Self, User> {
        belongs_to(
            Self::TO_INTRODUCER_USER_ID,
            User::ID,
            |change| Some(change.to_introducer_user_id),
            |change, user| change.to_introducer = Loaded::new(user),
        )
        .named("to_introducer")
    }
}
