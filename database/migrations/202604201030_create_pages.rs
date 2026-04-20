use async_trait::async_trait;
use forge::prelude::*;

pub struct Entry;

#[async_trait]
impl MigrationFile for Entry {
    async fn up(ctx: &MigrationContext<'_>) -> Result<()> {
        ctx.raw_execute(
            r#"
            CREATE TABLE pages (
                id UUID PRIMARY KEY DEFAULT uuidv7(),
                slug TEXT NOT NULL,
                is_system BOOLEAN NOT NULL DEFAULT false,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ
            )
            "#,
            &[],
        )
        .await?;

        ctx.raw_execute("CREATE UNIQUE INDEX idx_pages_slug ON pages (slug)", &[])
            .await?;
        ctx.raw_execute(
            "CREATE INDEX idx_pages_system_slug ON pages (is_system, slug)",
            &[],
        )
        .await?;

        Ok(())
    }

    async fn down(ctx: &MigrationContext<'_>) -> Result<()> {
        ctx.raw_execute("DROP TABLE IF EXISTS pages", &[]).await?;
        Ok(())
    }
}
