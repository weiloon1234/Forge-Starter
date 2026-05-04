use async_trait::async_trait;
use forge::prelude::*;

pub struct Entry;

#[async_trait]
impl MigrationFile for Entry {
    async fn up(ctx: &MigrationContext<'_>) -> Result<()> {
        ctx.raw_execute(
            "UPDATE admins SET username = LOWER(BTRIM(username))",
            &[],
        )
        .await?;

        ctx.raw_execute(
            "ALTER TABLE admins DROP CONSTRAINT IF EXISTS admins_username_key",
            &[],
        )
        .await?;

        ctx.raw_execute(
            "CREATE UNIQUE INDEX idx_admins_username_active_unique \
             ON admins (LOWER(username)) WHERE deleted_at IS NULL",
            &[],
        )
        .await?;

        Ok(())
    }

    async fn down(ctx: &MigrationContext<'_>) -> Result<()> {
        ctx.raw_execute(
            "DROP INDEX IF EXISTS idx_admins_username_active_unique",
            &[],
        )
        .await?;

        ctx.raw_execute(
            "ALTER TABLE admins ADD CONSTRAINT admins_username_key UNIQUE (username)",
            &[],
        )
        .await?;

        Ok(())
    }
}
