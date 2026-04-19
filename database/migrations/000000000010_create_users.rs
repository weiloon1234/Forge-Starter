use async_trait::async_trait;
use forge::prelude::*;

pub struct Entry;

#[async_trait]
impl MigrationFile for Entry {
    async fn up(ctx: &MigrationContext<'_>) -> Result<()> {
        ctx.raw_execute(
            r#"CREATE TABLE users (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                username TEXT NULL,
                name TEXT NULL,
                email TEXT NULL,
                introducer_user_id UUID NULL REFERENCES users (id) ON DELETE SET NULL,
                country_iso2 CHAR(2) NULL REFERENCES countries (iso2) ON DELETE RESTRICT ON UPDATE CASCADE,
                contact_country_iso2 CHAR(2) NULL REFERENCES countries (iso2) ON DELETE RESTRICT ON UPDATE CASCADE,
                contact_number TEXT NULL,
                credit_1 NUMERIC(20,8) NOT NULL DEFAULT 0,
                credit_2 NUMERIC(20,8) NOT NULL DEFAULT 0,
                credit_3 NUMERIC(20,8) NOT NULL DEFAULT 0,
                credit_4 NUMERIC(20,8) NOT NULL DEFAULT 0,
                credit_5 NUMERIC(20,8) NOT NULL DEFAULT 0,
                credit_6 NUMERIC(20,8) NOT NULL DEFAULT 0,
                password_hash TEXT NOT NULL,
                password2_hash TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                deleted_at TIMESTAMPTZ NULL
            )"#,
            &[],
        )
        .await?;

        ctx.raw_execute(
            "CREATE INDEX idx_users_introducer_user_id ON users (introducer_user_id)",
            &[],
        )
        .await?;

        ctx.raw_execute(
            "CREATE INDEX idx_users_country_iso2 ON users (country_iso2)",
            &[],
        )
        .await?;

        ctx.raw_execute(
            "CREATE INDEX idx_users_contact_country_iso2 ON users (contact_country_iso2)",
            &[],
        )
        .await?;

        ctx.raw_execute("CREATE INDEX idx_users_created_at ON users (created_at)", &[])
            .await?;

        ctx.raw_execute(
            r#"CREATE INDEX idx_users_username_active_lookup
               ON users (LOWER(username))
               WHERE deleted_at IS NULL
                 AND username IS NOT NULL"#,
            &[],
        )
        .await?;

        ctx.raw_execute(
            r#"CREATE INDEX idx_users_email_active_lookup
               ON users (LOWER(email))
               WHERE deleted_at IS NULL
                 AND email IS NOT NULL"#,
            &[],
        )
        .await?;

        Ok(())
    }

    async fn down(ctx: &MigrationContext<'_>) -> Result<()> {
        ctx.raw_execute("DROP TABLE IF EXISTS users", &[]).await?;
        Ok(())
    }
}
