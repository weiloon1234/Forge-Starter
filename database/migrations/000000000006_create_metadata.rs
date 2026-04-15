use async_trait::async_trait;
use forge::prelude::*;

pub struct Entry;

#[async_trait]
impl MigrationFile for Entry {
    async fn up(ctx: &MigrationContext<'_>) -> Result<()> {
        ctx.raw_execute(
            "CREATE TABLE IF NOT EXISTS metadata (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                metadatable_type TEXT NOT NULL,
                metadatable_id UUID NOT NULL,
                key TEXT NOT NULL,
                value JSONB,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ
            )",
            &[],
        )
        .await?;

        ctx.raw_execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_metadata_unique ON metadata (metadatable_type, metadatable_id, key)",
            &[],
        )
        .await?;

        Ok(())
    }

    async fn down(ctx: &MigrationContext<'_>) -> Result<()> {
        ctx.raw_execute("DROP TABLE IF EXISTS metadata", &[])
            .await?;
        Ok(())
    }
}
