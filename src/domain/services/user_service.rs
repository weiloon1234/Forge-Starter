use forge::prelude::*;

use crate::domain::models::User;
use crate::portals::user::requests::UpdateProfileRequest;

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
        user.id,
        UserIdentifier::Username,
        changes.username.as_deref(),
    )
    .await?;
    ensure_identifier_available(
        app,
        &mut validator,
        user.id,
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

#[derive(Debug)]
struct UserProfileChanges {
    username: Option<String>,
    name: Option<String>,
    email: Option<String>,
    country_iso2: Option<String>,
    contact_country_iso2: Option<String>,
    contact_number: Option<String>,
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
    user_id: ModelId<User>,
    identifier: UserIdentifier,
    value: Option<&str>,
) -> Result<()> {
    let Some(value) = value else {
        return Ok(());
    };

    let db = app.database()?;
    let exists = User::model_query()
        .where_(identifier.column().is_not_null())
        .where_(identifier.column().ieq(value.trim()))
        .where_(User::ID.not_eq(user_id))
        .first(db.as_ref())
        .await?;

    if exists.is_some() {
        validator.add_error(identifier.field(), "unique", &[]);
    }

    Ok(())
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
