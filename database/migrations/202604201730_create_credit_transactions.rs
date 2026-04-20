use async_trait::async_trait;
use forge::prelude::*;

pub struct Entry;

#[async_trait]
impl MigrationFile for Entry {
    async fn up(ctx: &MigrationContext<'_>) -> Result<()> {
        ctx.raw_execute(
            r#"
            CREATE TABLE credit_transactions (
                id UUID PRIMARY KEY DEFAULT uuidv7(),
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
                credit_type TEXT NOT NULL,
                transaction_type TEXT NOT NULL,
                amount NUMERIC(20,8) NOT NULL,
                balance_before NUMERIC(20,8) NOT NULL,
                balance_after NUMERIC(20,8) NOT NULL,
                explanation_key TEXT NOT NULL,
                explanation_params JSONB NOT NULL DEFAULT '{}'::jsonb,
                explanation_overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
                related_key UUID,
                related_type TEXT,
                context JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ
            )
            "#,
            &[],
        )
        .await?;

        ctx.raw_execute(
            "CREATE INDEX idx_credit_transactions_user_created_at ON credit_transactions (user_id, created_at DESC)",
            &[],
        )
        .await?;
        ctx.raw_execute(
            "CREATE INDEX idx_credit_transactions_related_key ON credit_transactions (related_key)",
            &[],
        )
        .await?;
        ctx.raw_execute(
            "CREATE INDEX idx_credit_transactions_credit_type_created_at ON credit_transactions (credit_type, created_at DESC)",
            &[],
        )
        .await?;
        ctx.raw_execute(
            "CREATE INDEX idx_credit_transactions_transaction_type_created_at ON credit_transactions (transaction_type, created_at DESC)",
            &[],
        )
        .await?;

        ctx.raw_execute(
            r#"
            CREATE TABLE admin_credit_adjustments (
                id UUID PRIMARY KEY DEFAULT uuidv7(),
                credit_transaction_id UUID NOT NULL UNIQUE REFERENCES credit_transactions(id) ON DELETE CASCADE,
                admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE RESTRICT,
                remark TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ
            )
            "#,
            &[],
        )
        .await?;

        ctx.raw_execute(
            "CREATE INDEX idx_admin_credit_adjustments_admin_created_at ON admin_credit_adjustments (admin_id, created_at DESC)",
            &[],
        )
        .await?;

        Ok(())
    }

    async fn down(ctx: &MigrationContext<'_>) -> Result<()> {
        ctx.raw_execute("DROP TABLE IF EXISTS admin_credit_adjustments", &[])
            .await?;
        ctx.raw_execute("DROP TABLE IF EXISTS credit_transactions", &[])
            .await?;
        Ok(())
    }
}
