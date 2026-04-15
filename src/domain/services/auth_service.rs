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
        .ok_or_else(|| Error::http(401, "Invalid credentials"))?;

    let hash = app.hash()?;
    if !hash.check(password, &user.password_hash)? {
        return Err(Error::http(401, "Invalid credentials"));
    }

    let tokens = user.create_token(app).await?;

    Ok(tokens)
}

/// Token-based login for the admin portal (by username).
pub async fn admin_login_with_token(
    app: &AppContext,
    username: &str,
    password: &str,
) -> Result<TokenPair> {
    let db = app.database()?;

    let admin = Admin::model_query()
        .where_(Admin::USERNAME.eq(username))
        .first(&*db)
        .await?
        .ok_or_else(|| Error::http(401, "Invalid credentials"))?;

    let hash = app.hash()?;
    if !hash.check(password, &admin.password_hash)? {
        return Err(Error::http(401, "Invalid credentials"));
    }

    let tokens = admin.create_token(app).await?;

    Ok(tokens)
}
