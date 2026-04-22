use forge::prelude::*;
use serde::Serialize;
use serde_json::json;
use ts_rs::TS;

use crate::domain::models::{Admin, AdminUserIntroducerChange, User};
use crate::portals::admin::requests::{
    ChangeUserIntroducerRequest, CreateUserRequest, UpdateUserRequest,
};
use crate::portals::user::requests::UpdateProfileRequest;

const USER_OPTION_LIMIT: u64 = 20;

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

pub async fn create(app: &AppContext, i18n: &I18n, req: &CreateUserRequest) -> Result<User> {
    let changes = UserCreationChanges::from_request(req)?;

    let mut validator = Validator::new(app.clone());
    validator.set_locale(i18n.locale().to_string());

    ensure_identifier_available(
        app,
        &mut validator,
        None,
        UserIdentifier::Username,
        changes.username.as_deref(),
    )
    .await?;
    ensure_identifier_available(
        app,
        &mut validator,
        None,
        UserIdentifier::Email,
        changes.email.as_deref(),
    )
    .await?;
    ensure_introducer_exists(app, &mut validator, changes.introducer_user_id).await?;
    validator.finish()?;

    let transaction = app.begin_transaction().await?;
    let UserCreationChanges {
        introducer_user_id,
        username,
        name,
        email,
        country_iso2,
        contact_country_iso2,
        contact_number,
        password,
    } = changes;

    let created = User::model_create()
        .set(User::INTRODUCER_USER_ID, Some(introducer_user_id))
        .set(User::USERNAME, username)
        .set(User::NAME, name)
        .set(User::EMAIL, email)
        .set(User::COUNTRY_ISO2, country_iso2)
        .set(User::CONTACT_COUNTRY_ISO2, contact_country_iso2)
        .set(User::CONTACT_NUMBER, contact_number)
        .set(User::PASSWORD_HASH, password.as_str())
        .set(User::PASSWORD2_HASH, password.as_str())
        .save(&transaction)
        .await?;

    transaction.commit().await?;

    Ok(created)
}

pub async fn user_options(
    app: &AppContext,
    query: Option<&str>,
) -> Result<Vec<AdminUserLookupOptionResponse>> {
    let db = app.database()?;
    let mut users = User::model_query().order_by(User::CREATED_AT.desc());
    let query = query.and_then(|value| trimmed_option(Some(value)));

    if let Some(query) = query.as_deref() {
        users = users.where_(Condition::or([
            Condition::and([
                User::NAME.is_not_null(),
                User::NAME.like(format!("%{query}%")),
            ]),
            Condition::and([
                User::USERNAME.is_not_null(),
                User::USERNAME.like(format!("%{query}%")),
            ]),
            Condition::and([
                User::EMAIL.is_not_null(),
                User::EMAIL.like(format!("%{query}%")),
            ]),
        ]));
    }

    users.limit(USER_OPTION_LIMIT).get(&*db).await.map(|rows| {
        rows.into_iter()
            .map(|user| AdminUserLookupOptionResponse::from(&user))
            .collect()
    })
}

pub async fn change_introducer(
    app: &AppContext,
    i18n: &I18n,
    admin: &Admin,
    user_id: ModelId<User>,
    req: &ChangeUserIntroducerRequest,
) -> Result<AdminUserIntroducerChangeResponse> {
    let next_introducer_user_id =
        ModelId::<User>::parse_str(req.introducer_user_id.trim()).map_err(Error::other)?;

    let mut validator = Validator::new(app.clone());
    validator.set_locale(i18n.locale().to_string());
    ensure_introducer_exists(app, &mut validator, next_introducer_user_id).await?;
    validator.finish()?;

    let transaction = app.begin_transaction().await?;
    let user = User::model_query()
        .where_(User::ID.eq(user_id))
        .for_update()
        .first(&transaction)
        .await?
        .ok_or_else(|| Error::not_found(forge::t!(i18n, "error.user_not_found")))?;

    let current_introducer_user_id = user.introducer_user_id.ok_or_else(|| {
        Error::http(
            422,
            forge::t!(
                i18n,
                "admin.introducer_changes.errors.current_introducer_required"
            ),
        )
    })?;

    if user.id == next_introducer_user_id {
        return Err(Error::http(
            422,
            forge::t!(i18n, "admin.introducer_changes.errors.self_introducer"),
        ));
    }

    if current_introducer_user_id == next_introducer_user_id {
        return Err(Error::http(
            422,
            forge::t!(i18n, "admin.introducer_changes.errors.same_introducer"),
        ));
    }

    let current_introducer = User::model_query()
        .where_(User::ID.eq(current_introducer_user_id))
        .first(&transaction)
        .await?
        .ok_or_else(|| {
            Error::http(
                422,
                forge::t!(
                    i18n,
                    "admin.introducer_changes.errors.current_introducer_required"
                ),
            )
        })?;

    let next_introducer = User::model_query()
        .where_(User::ID.eq(next_introducer_user_id))
        .first(&transaction)
        .await?
        .ok_or_else(|| fail_field_validation(app, i18n.locale(), "introducer_user_id", "exists"))?;

    transaction
        .raw_execute(
            "SELECT set_config('app.allowed_user_introducer_change', $1, true)",
            &[DbValue::Text(
                json!({
                    "user_id": user.id.to_string(),
                    "from_introducer_user_id": current_introducer.id.to_string(),
                    "to_introducer_user_id": next_introducer.id.to_string(),
                })
                .to_string(),
            )],
        )
        .await?;

    let persisted_change = AdminUserIntroducerChange::model_create()
        .set(AdminUserIntroducerChange::ADMIN_ID, admin.id)
        .set(
            AdminUserIntroducerChange::ADMIN_USERNAME,
            admin.username.as_str(),
        )
        .set(AdminUserIntroducerChange::USER_ID, user.id)
        .set(
            AdminUserIntroducerChange::USER_USERNAME,
            user.username.clone(),
        )
        .set(
            AdminUserIntroducerChange::FROM_INTRODUCER_USER_ID,
            current_introducer.id,
        )
        .set(
            AdminUserIntroducerChange::FROM_INTRODUCER_USERNAME,
            current_introducer.username.clone(),
        )
        .set(
            AdminUserIntroducerChange::TO_INTRODUCER_USER_ID,
            next_introducer.id,
        )
        .set(
            AdminUserIntroducerChange::TO_INTRODUCER_USERNAME,
            next_introducer.username.clone(),
        )
        .save(&transaction)
        .await?;

    user.update()
        .set(User::INTRODUCER_USER_ID, Some(next_introducer.id))
        .save(&transaction)
        .await?;

    transaction.commit().await?;

    Ok(AdminUserIntroducerChangeResponse::from(&persisted_change))
}

pub async fn update(
    app: &AppContext,
    i18n: &I18n,
    user_id: ModelId<User>,
    req: &UpdateUserRequest,
) -> Result<User> {
    let db = app.database()?;
    let user = User::model_query()
        .where_(User::ID.eq(user_id))
        .first(db.as_ref())
        .await?
        .ok_or_else(|| Error::not_found(forge::t!(i18n, "error.user_not_found")))?;

    let changes = UserUpdateChanges::from_request(req);

    let mut validator = Validator::new(app.clone());
    validator.set_locale(i18n.locale().to_string());

    ensure_identifier_available(
        app,
        &mut validator,
        Some(user.id),
        UserIdentifier::Username,
        changes.username.as_deref(),
    )
    .await?;
    ensure_identifier_available(
        app,
        &mut validator,
        Some(user.id),
        UserIdentifier::Email,
        changes.email.as_deref(),
    )
    .await?;
    validator.finish()?;

    let transaction = app.begin_transaction().await?;
    let UserUpdateChanges {
        username,
        name,
        email,
        country_iso2,
        contact_country_iso2,
        contact_number,
        password,
    } = changes;

    let mut builder = user
        .update()
        .set(User::USERNAME, username)
        .set(User::NAME, name)
        .set(User::EMAIL, email)
        .set(User::COUNTRY_ISO2, country_iso2)
        .set(User::CONTACT_COUNTRY_ISO2, contact_country_iso2)
        .set(User::CONTACT_NUMBER, contact_number);

    if let Some(password) = password {
        builder = builder
            .set(User::PASSWORD_HASH, password.as_str())
            .set(User::PASSWORD2_HASH, password.as_str());
    }

    let updated = builder.save(&transaction).await?;
    transaction.commit().await?;
    Ok(updated)
}

pub async fn update_profile(
    app: &AppContext,
    i18n: &I18n,
    user: &User,
    req: &UpdateProfileRequest,
) -> Result<User> {
    let changes = UserProfileChanges::from_request(req);

    let mut validator = Validator::new(app.clone());
    validator.set_locale(i18n.locale().to_string());

    ensure_identifier_available(
        app,
        &mut validator,
        Some(user.id),
        UserIdentifier::Username,
        changes.username.as_deref(),
    )
    .await?;
    ensure_identifier_available(
        app,
        &mut validator,
        Some(user.id),
        UserIdentifier::Email,
        changes.email.as_deref(),
    )
    .await?;
    validator.finish()?;

    let transaction = app.begin_transaction().await?;
    let UserProfileChanges {
        username,
        name,
        email,
        country_iso2,
        contact_country_iso2,
        contact_number,
    } = changes;
    let updated = user
        .update()
        .set(User::USERNAME, username)
        .set(User::NAME, name)
        .set(User::EMAIL, email)
        .set(User::COUNTRY_ISO2, country_iso2)
        .set(User::CONTACT_COUNTRY_ISO2, contact_country_iso2)
        .set(User::CONTACT_NUMBER, contact_number)
        .save(&transaction)
        .await?;

    transaction.commit().await?;

    Ok(updated)
}

pub fn user_label(user: &User) -> String {
    user_identity_label(
        user.name.as_deref(),
        user.username.as_deref(),
        user.email.as_deref(),
        &user.id.to_string(),
    )
}

#[derive(Debug)]
struct UserProfileChanges {
    username: Option<String>,
    name: Option<String>,
    email: Option<String>,
    country_iso2: Option<String>,
    contact_country_iso2: Option<String>,
    contact_number: Option<String>,
}

#[derive(Debug)]
struct UserUpdateChanges {
    username: Option<String>,
    name: Option<String>,
    email: Option<String>,
    country_iso2: Option<String>,
    contact_country_iso2: Option<String>,
    contact_number: Option<String>,
    password: Option<String>,
}

impl UserUpdateChanges {
    fn from_request(req: &UpdateUserRequest) -> Self {
        Self {
            username: trimmed_option(req.username.as_deref()),
            name: trimmed_option(req.name.as_deref()),
            email: normalized_email(req.email.as_deref()),
            country_iso2: normalized_iso2(req.country_iso2.as_deref()),
            contact_country_iso2: normalized_iso2(req.contact_country_iso2.as_deref()),
            contact_number: trimmed_option(req.contact_number.as_deref()),
            password: trimmed_option(req.password.as_deref()),
        }
    }
}

#[derive(Debug)]
struct UserCreationChanges {
    introducer_user_id: ModelId<User>,
    username: Option<String>,
    name: Option<String>,
    email: Option<String>,
    country_iso2: Option<String>,
    contact_country_iso2: Option<String>,
    contact_number: Option<String>,
    password: String,
}

impl UserProfileChanges {
    fn from_request(req: &UpdateProfileRequest) -> Self {
        Self {
            username: trimmed_option(req.username.as_deref()),
            name: trimmed_option(req.name.as_deref()),
            email: normalized_email(req.email.as_deref()),
            country_iso2: normalized_iso2(req.country_iso2.as_deref()),
            contact_country_iso2: normalized_iso2(req.contact_country_iso2.as_deref()),
            contact_number: trimmed_option(req.contact_number.as_deref()),
        }
    }
}

impl UserCreationChanges {
    fn from_request(req: &CreateUserRequest) -> Result<Self> {
        Ok(Self {
            introducer_user_id: ModelId::<User>::parse_str(req.introducer_user_id.trim())
                .map_err(Error::other)?,
            username: trimmed_option(req.username.as_deref()),
            name: trimmed_option(req.name.as_deref()),
            email: normalized_email(req.email.as_deref()),
            country_iso2: normalized_iso2(req.country_iso2.as_deref()),
            contact_country_iso2: normalized_iso2(req.contact_country_iso2.as_deref()),
            contact_number: trimmed_option(req.contact_number.as_deref()),
            password: req.password.clone(),
        })
    }
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

#[derive(Clone, Copy)]
enum UserIdentifier {
    Username,
    Email,
}

impl UserIdentifier {
    fn column(self) -> Column<User, Option<String>> {
        match self {
            Self::Username => User::USERNAME,
            Self::Email => User::EMAIL,
        }
    }

    fn field(self) -> &'static str {
        self.column().name()
    }
}

async fn ensure_identifier_available(
    app: &AppContext,
    validator: &mut Validator,
    user_id: Option<ModelId<User>>,
    identifier: UserIdentifier,
    value: Option<&str>,
) -> Result<()> {
    let Some(value) = value else {
        return Ok(());
    };

    let db = app.database()?;
    let mut query = User::model_query()
        .where_(identifier.column().is_not_null())
        .where_(identifier.column().ieq(value.trim()));

    if let Some(user_id) = user_id {
        query = query.where_(User::ID.not_eq(user_id));
    }

    let exists = query.first(db.as_ref()).await?;

    if exists.is_some() {
        validator.add_error(identifier.field(), "unique", &[]);
    }

    Ok(())
}

async fn ensure_introducer_exists(
    app: &AppContext,
    validator: &mut Validator,
    introducer_user_id: ModelId<User>,
) -> Result<()> {
    let db = app.database()?;
    let introducer = User::model_query()
        .where_(User::ID.eq(introducer_user_id))
        .first(db.as_ref())
        .await?;

    if introducer.is_none() {
        validator.add_error("introducer_user_id", "exists", &[]);
    }

    Ok(())
}

fn fail_field_validation(app: &AppContext, locale: &str, field: &str, code: &str) -> Error {
    let mut validator = Validator::new(app.clone());
    validator.set_locale(locale.to_string());
    validator.add_error(field, code, &[]);

    match validator.finish() {
        Ok(()) => Error::message("validation error was expected"),
        Err(error) => Error::Validation(error),
    }
}

fn user_identity_label(
    name: Option<&str>,
    username: Option<&str>,
    email: Option<&str>,
    fallback: &str,
) -> String {
    trimmed_option(name)
        .or_else(|| trimmed_option(username))
        .or_else(|| trimmed_option(email))
        .unwrap_or_else(|| fallback.to_string())
}

fn user_identity_subtitle(user: &User) -> Option<String> {
    user.username
        .as_deref()
        .and_then(|value| trimmed_option(Some(value)))
        .filter(|value| Some(value.as_str()) != user.name.as_deref().map(str::trim))
        .or_else(|| {
            user.email
                .as_deref()
                .and_then(|value| trimmed_option(Some(value)))
        })
}

fn snapshot_label(username: Option<&str>, fallback: &str) -> String {
    trimmed_option(username).unwrap_or_else(|| fallback.to_string())
}

fn trimmed_option(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn normalized_email(value: Option<&str>) -> Option<String> {
    trimmed_option(value).map(|value| value.to_ascii_lowercase())
}

fn normalized_iso2(value: Option<&str>) -> Option<String> {
    trimmed_option(value).map(|value| value.to_ascii_uppercase())
}
