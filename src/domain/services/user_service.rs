use forge::prelude::*;
use serde_json::json;

use crate::domain::models::{Admin, AdminUserIntroducerChange, User};
use crate::portals::admin::requests::{
    ChangeUserIntroducerRequest, CreateUserRequest, UpdateUserRequest,
};
use crate::portals::admin::responses::{
    AdminUserIntroducerChangeResponse, AdminUserLookupOptionResponse,
};
use crate::portals::user::requests::UpdateProfileRequest;
use crate::support::strings::{normalized_email, normalized_iso2, trimmed_string};
use crate::support::validation;

const USER_OPTION_LIMIT: u64 = 20;

pub async fn create(app: &AppContext, i18n: &I18n, req: &CreateUserRequest) -> Result<User> {
    let changes = UserCreationChanges::from_request(req)?;

    let mut validator = validation::new_validator(app, i18n.locale());

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
    let query = query.and_then(|value| trimmed_string(Some(value)));

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

    let mut validator = validation::new_validator(app, i18n.locale());
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
        .ok_or_else(|| {
            validation::field_error(app, i18n.locale(), "introducer_user_id", "exists", &[])
        })?;

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

    let mut validator = validation::new_validator(app, i18n.locale());

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

    let mut validator = validation::new_validator(app, i18n.locale());

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
            username: trimmed_string(req.username.as_deref()),
            name: trimmed_string(req.name.as_deref()),
            email: normalized_email(req.email.as_deref()),
            country_iso2: normalized_iso2(req.country_iso2.as_deref()),
            contact_country_iso2: normalized_iso2(req.contact_country_iso2.as_deref()),
            contact_number: trimmed_string(req.contact_number.as_deref()),
            password: trimmed_string(req.password.as_deref()),
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
            username: trimmed_string(req.username.as_deref()),
            name: trimmed_string(req.name.as_deref()),
            email: normalized_email(req.email.as_deref()),
            country_iso2: normalized_iso2(req.country_iso2.as_deref()),
            contact_country_iso2: normalized_iso2(req.contact_country_iso2.as_deref()),
            contact_number: trimmed_string(req.contact_number.as_deref()),
        }
    }
}

impl UserCreationChanges {
    fn from_request(req: &CreateUserRequest) -> Result<Self> {
        Ok(Self {
            introducer_user_id: ModelId::<User>::parse_str(req.introducer_user_id.trim())
                .map_err(Error::other)?,
            username: trimmed_string(req.username.as_deref()),
            name: trimmed_string(req.name.as_deref()),
            email: normalized_email(req.email.as_deref()),
            country_iso2: normalized_iso2(req.country_iso2.as_deref()),
            contact_country_iso2: normalized_iso2(req.contact_country_iso2.as_deref()),
            contact_number: trimmed_string(req.contact_number.as_deref()),
            password: req.password.clone(),
        })
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

fn user_identity_label(
    name: Option<&str>,
    username: Option<&str>,
    email: Option<&str>,
    fallback: &str,
) -> String {
    trimmed_string(name)
        .or_else(|| trimmed_string(username))
        .or_else(|| trimmed_string(email))
        .unwrap_or_else(|| fallback.to_string())
}

pub fn user_identity_subtitle(user: &User) -> Option<String> {
    user.username
        .as_deref()
        .and_then(|value| trimmed_string(Some(value)))
        .filter(|value| Some(value.as_str()) != user.name.as_deref().map(str::trim))
        .or_else(|| {
            user.email
                .as_deref()
                .and_then(|value| trimmed_string(Some(value)))
        })
}

pub fn snapshot_label(username: Option<&str>, fallback: &str) -> String {
    trimmed_string(username).unwrap_or_else(|| fallback.to_string())
}
