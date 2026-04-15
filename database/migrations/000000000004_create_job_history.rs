use async_trait::async_trait;
use forge::prelude::*;

pub struct Entry;

#[async_trait]
impl MigrationFile for Entry {
    async fn up(ctx: &MigrationContext<'_>) -> Result<()> {
        ctx.raw_execute(
            "CREATE TABLE IF NOT EXISTS job_history (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                job_id TEXT NOT NULL,
                queue TEXT NOT NULL,
                status TEXT NOT NULL,
                attempt INT NOT NULL DEFAULT 1,
                error TEXT,
                started_at TIMESTAMPTZ,
                completed_at TIMESTAMPTZ,
                duration_ms BIGINT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )",
            &[],
        )
        .await?;

        ctx.raw_execute(
            "CREATE INDEX IF NOT EXISTS idx_job_history_status ON job_history (status, created_at DESC)",
            &[],
        )
        .await?;

        Ok(())
    }

    async fn down(ctx: &MigrationContext<'_>) -> Result<()> {
        ctx.raw_execute("DROP TABLE IF EXISTS job_history", &[])
            .await?;
        Ok(())
    }
}
