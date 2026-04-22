use forge::prelude::*;
use forge::LoginThrottle;

use crate::domain::models::{Admin, User};
use crate::domain::services::admin_service;

/// Token-based login for the user portal.
pub async fn login_with_token(
    app: &AppContext,
    i18n: &I18n,
    login: &str,
    password: &str,
) -> Result<TokenPair> {
    let throttle = LoginThrottle::new(app)?;
    throttle.before_attempt(login).await?;

    let db = app.database()?;
    let user = match User::find_active_by_login(db.as_ref(), login).await? {
        Some(user) => user,
        None => {
            throttle.record_failure(login).await?;
            return Err(Error::http(
                401,
                forge::t!(i18n, "auth.invalid_credentials"),
            ));
        }
    };

    let hash = app.hash()?;
    if !hash.check(password, &user.password_hash)? {
        throttle.record_failure(login).await?;
        return Err(Error::http(
            401,
            forge::t!(i18n, "auth.invalid_credentials"),
        ));
    }

    throttle.record_success(login).await?;

    let tokens = user.create_token_named(app, "user").await?;

    Ok(tokens)
}

pub async fn refresh_user_token(app: &AppContext, refresh_token: &str) -> Result<TokenPair> {
    app.tokens()?.refresh(refresh_token).await
}

/// Token-based login for the admin portal (by username).
pub async fn admin_login_with_token(
    app: &AppContext,
    i18n: &I18n,
    username: &str,
    password: &str,
) -> Result<TokenPair> {
    let throttle = LoginThrottle::new(app)?;
    throttle.before_attempt(username).await?;

    let db = app.database()?;

    let admin = match Admin::model_query()
        .where_(Admin::USERNAME.eq(username))
        .first(&*db)
        .await?
    {
        Some(admin) => admin,
        None => {
            throttle.record_failure(username).await?;
            return Err(Error::http(
                401,
                forge::t!(i18n, "auth.invalid_credentials"),
            ));
        }
    };

    let hash = app.hash()?;
    if !hash.check(password, &admin.password_hash)? {
        throttle.record_failure(username).await?;
        return Err(Error::http(
            401,
            forge::t!(i18n, "auth.invalid_credentials"),
        ));
    }

    throttle.record_success(username).await?;

    let tokens = admin
        .create_token_with_abilities(
            app,
            "admin",
            admin_service::effective_permission_keys(&admin),
        )
        .await?;

    Ok(tokens)
}

pub async fn refresh_admin_token(app: &AppContext, refresh_token: &str) -> Result<TokenPair> {
    app.tokens()?.refresh(refresh_token).await
}
