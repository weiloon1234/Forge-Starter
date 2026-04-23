use serde::Serialize;
use ts_rs::TS;

use crate::domain::models::{AdminUserIntroducerChange, User};
use crate::domain::services::user_service::{snapshot_label, user_identity_subtitle, user_label};

/// Admin view of a user (includes internal profile and reserved credit fields).
#[derive(Serialize, TS, forge::ApiSchema)]
#[ts(export)]
pub struct AdminUserResponse {
    pub id: String,
    pub introducer_user_id: Option<String>,
    pub username: Option<String>,
    pub email: Option<String>,
    pub name: Option<String>,
    pub country_iso2: Option<String>,
    pub contact_country_iso2: Option<String>,
    pub contact_number: Option<String>,
    pub credit_1: String,
    pub credit_2: String,
    pub credit_3: String,
    pub credit_4: String,
    pub credit_5: String,
    pub credit_6: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Serialize, TS, forge::ApiSchema)]
#[ts(export)]
pub struct AdminUserLookupOptionResponse {
    pub id: String,
    pub label: String,
    pub subtitle: Option<String>,
    pub credit_1: String,
    pub credit_2: String,
    pub credit_3: String,
    pub credit_4: String,
    pub credit_5: String,
    pub credit_6: String,
}

impl From<&User> for AdminUserLookupOptionResponse {
    fn from(user: &User) -> Self {
        Self {
            id: user.id.to_string(),
            label: user_label(user),
            subtitle: user_identity_subtitle(user),
            credit_1: user.credit_1.to_string(),
            credit_2: user.credit_2.to_string(),
            credit_3: user.credit_3.to_string(),
            credit_4: user.credit_4.to_string(),
            credit_5: user.credit_5.to_string(),
            credit_6: user.credit_6.to_string(),
        }
    }
}

#[derive(Clone, Debug, Serialize, TS, forge::ApiSchema)]
#[ts(export)]
pub struct AdminUserIntroducerChangeResponse {
    pub id: String,
    pub admin_id: String,
    pub admin_username: String,
    pub admin_label: String,
    pub user_id: String,
    pub user_username: Option<String>,
    pub user_label: String,
    pub from_introducer_user_id: String,
    pub from_introducer_username: Option<String>,
    pub from_introducer_label: String,
    pub to_introducer_user_id: String,
    pub to_introducer_username: Option<String>,
    pub to_introducer_label: String,
    pub created_at: String,
    pub updated_at: Option<String>,
}

impl From<&AdminUserIntroducerChange> for AdminUserIntroducerChangeResponse {
    fn from(change: &AdminUserIntroducerChange) -> Self {
        let admin_id = change.admin_id.to_string();
        let user_id = change.user_id.to_string();
        let from_introducer_user_id = change.from_introducer_user_id.to_string();
        let to_introducer_user_id = change.to_introducer_user_id.to_string();

        Self {
            id: change.id.to_string(),
            admin_id: admin_id.clone(),
            admin_username: change.admin_username.clone(),
            admin_label: snapshot_label(Some(change.admin_username.as_str()), &admin_id),
            user_id: user_id.clone(),
            user_username: change.user_username.clone(),
            user_label: snapshot_label(change.user_username.as_deref(), &user_id),
            from_introducer_user_id: from_introducer_user_id.clone(),
            from_introducer_username: change.from_introducer_username.clone(),
            from_introducer_label: snapshot_label(
                change.from_introducer_username.as_deref(),
                &from_introducer_user_id,
            ),
            to_introducer_user_id: to_introducer_user_id.clone(),
            to_introducer_username: change.to_introducer_username.clone(),
            to_introducer_label: snapshot_label(
                change.to_introducer_username.as_deref(),
                &to_introducer_user_id,
            ),
            created_at: change.created_at.to_string(),
            updated_at: change.updated_at.map(|value| value.to_string()),
        }
    }
}
