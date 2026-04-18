use async_trait::async_trait;
use forge::prelude::*;

pub struct Entry;

#[async_trait]
impl MigrationFile for Entry {
    async fn up(ctx: &MigrationContext<'_>) -> Result<()> {
        ctx.raw_execute(
            r#"ALTER TABLE admins
               ADD COLUMN permissions TEXT[] NOT NULL DEFAULT ARRAY[]::text[]"#,
            &[],
        )
        .await?;
        Ok(())
    }

    async fn down(ctx: &MigrationContext<'_>) -> Result<()> {
        ctx.raw_execute(
            r#"ALTER TABLE admins
               DROP COLUMN IF EXISTS permissions"#,
            &[],
        )
        .await?;
        Ok(())
    }
}
