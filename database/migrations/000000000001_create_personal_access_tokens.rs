use async_trait::async_trait;
use forge::prelude::*;

pub struct Entry;

#[async_trait]
impl MigrationFile for Entry {
    async fn up(ctx: &MigrationContext<'_>) -> Result<()> {
        ctx.raw_execute(
            "CREATE TABLE IF NOT EXISTS personal_access_tokens (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                guard TEXT NOT NULL,
                actor_id UUID NOT NULL,
                name TEXT NOT NULL DEFAULT '',
                access_token_hash TEXT NOT NULL,
                refresh_token_hash TEXT,
                abilities JSONB NOT NULL DEFAULT '[]',
                expires_at TIMESTAMPTZ NOT NULL,
                refresh_expires_at TIMESTAMPTZ,
                last_used_at TIMESTAMPTZ,
                revoked_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )",
            &[],
        )
        .await?;

        ctx.raw_execute(
            "CREATE INDEX IF NOT EXISTS idx_pat_access_hash ON personal_access_tokens (access_token_hash)",
            &[],
        )
        .await?;

        ctx.raw_execute(
            "CREATE INDEX IF NOT EXISTS idx_pat_refresh_hash ON personal_access_tokens (refresh_token_hash)",
            &[],
        )
        .await?;

        ctx.raw_execute(
            "CREATE INDEX IF NOT EXISTS idx_pat_actor ON personal_access_tokens (guard, actor_id)",
            &[],
        )
        .await?;

        Ok(())
    }

    async fn down(ctx: &MigrationContext<'_>) -> Result<()> {
        ctx.raw_execute("DROP TABLE IF EXISTS personal_access_tokens", &[])
            .await?;
        Ok(())
    }
}
