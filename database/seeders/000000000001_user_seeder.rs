use async_trait::async_trait;
use forge::prelude::*;

use crate::domain::models::User;

const ORIGIN_EMAIL: &str = "origin@localhost";
const ORIGIN_NAME: &str = "Origin";
const ORIGIN_PASSWORD: &str = "123456789000";

pub struct Entry;

#[async_trait]
impl SeederFile for Entry {
    async fn run(ctx: &SeederContext<'_>) -> Result<()> {
        ensure_origin_user(ctx).await?;
        println!("  seeded user: {}", User::ORIGIN_USERNAME);
        Ok(())
    }
}

async fn ensure_origin_user(ctx: &SeederContext<'_>) -> Result<User> {
    let existing_root = User::model_query()
        .where_(User::INTRODUCER_USER_ID.is_null())
        .order_by(User::CREATED_AT.asc())
        .first(ctx.app())
        .await?;

    match existing_root {
        Some(user) => user
            .update()
            .set(User::USERNAME, User::ORIGIN_USERNAME)
            .set(User::NAME, ORIGIN_NAME)
            .set(User::EMAIL, ORIGIN_EMAIL)
            .set(User::PASSWORD_HASH, ORIGIN_PASSWORD)
            .set(User::PASSWORD2_HASH, ORIGIN_PASSWORD)
            .save(ctx.app())
            .await,
        None => {
            User::model_create()
                .set(User::USERNAME, User::ORIGIN_USERNAME)
                .set(User::NAME, ORIGIN_NAME)
                .set(User::EMAIL, ORIGIN_EMAIL)
                .set(User::PASSWORD_HASH, ORIGIN_PASSWORD)
                .set(User::PASSWORD2_HASH, ORIGIN_PASSWORD)
                .save(ctx.app())
                .await
        }
    }
}
