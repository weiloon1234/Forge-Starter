use forge::prelude::*;

use crate::domain::models::{Admin, User};

/// Token-based login for the user portal.
pub async fn login_with_token(
    app: &AppContext,
    email: &str,
    password: &str,
) -> Result<TokenPair> {
    let db = app.database()?;

    let user = User::model_query()
        .where_(User::EMAIL.eq(email))
        .first(&*db)
        .await?
        .ok_or_else(|| Error::http(401, "invalid credentials"))?;

    let hash = app.hash()?;
    if !hash.check(password, &user.password_hash)? {
        return Err(Error::http(401, "invalid credentials"));
    }

    let tokens = user.create_token(app).await?;

    Ok(tokens)
}

/// Session-based login for the admin portal. Returns session ID and admin.
pub async fn login_with_session(
    app: &AppContext,
    email: &str,
    password: &str,
) -> Result<(String, Admin)> {
    let db = app.database()?;

    let admin = Admin::model_query()
        .where_(Admin::EMAIL.eq(email))
        .first(&*db)
        .await?
        .ok_or_else(|| Error::http(401, "invalid credentials"))?;

    let hash = app.hash()?;
    if !hash.check(password, &admin.password_hash)? {
        return Err(Error::http(401, "invalid credentials"));
    }

    let sessions = app.sessions()?;
    let session_id = sessions.create::<Admin>(&admin.id.to_string()).await?;

    Ok((session_id, admin))
}
