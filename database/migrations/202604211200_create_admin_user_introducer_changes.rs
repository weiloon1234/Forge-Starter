use async_trait::async_trait;
use forge::prelude::*;

use crate::domain::models::User;

pub struct Entry;

#[async_trait]
impl MigrationFile for Entry {
    async fn up(ctx: &MigrationContext<'_>) -> Result<()> {
        ctx.raw_execute(
            r#"
            CREATE TABLE admin_user_introducer_changes (
                id UUID PRIMARY KEY DEFAULT uuidv7(),
                admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE RESTRICT,
                admin_username TEXT NOT NULL,
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
                user_username TEXT,
                from_introducer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
                from_introducer_username TEXT,
                to_introducer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
                to_introducer_username TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ
            )
            "#,
            &[],
        )
        .await?;

        ctx.raw_execute(
            "CREATE INDEX idx_admin_user_introducer_changes_admin_created_at ON admin_user_introducer_changes (admin_id, created_at DESC)",
            &[],
        )
        .await?;
        ctx.raw_execute(
            "CREATE INDEX idx_admin_user_introducer_changes_user_created_at ON admin_user_introducer_changes (user_id, created_at DESC)",
            &[],
        )
        .await?;
        ctx.raw_execute(
            "CREATE INDEX idx_admin_user_introducer_changes_created_at ON admin_user_introducer_changes (created_at DESC)",
            &[],
        )
        .await?;

        ctx.raw_execute(
            &format!(
                r#"CREATE OR REPLACE FUNCTION enforce_user_introducer_rules() RETURNS TRIGGER AS $$
                   DECLARE allowed_change JSONB;
                   BEGIN
                       IF TG_OP = 'UPDATE'
                          AND NEW.introducer_user_id IS DISTINCT FROM OLD.introducer_user_id
                       THEN
                           IF OLD.deleted_at IS NULL
                              AND OLD.introducer_user_id IS NULL
                           THEN
                               RAISE EXCEPTION 'the origin introducer_user_id cannot be changed';
                           END IF;

                           IF NEW.introducer_user_id IS NULL THEN
                               RAISE EXCEPTION 'only the origin user may have a null introducer_user_id';
                           END IF;

                           allowed_change := current_setting(
                               'app.allowed_user_introducer_change',
                               true
                           )::jsonb;

                           IF allowed_change IS NULL THEN
                               RAISE EXCEPTION 'users.introducer_user_id can only be changed through the audited admin flow';
                           END IF;

                           IF allowed_change->>'user_id' IS DISTINCT FROM NEW.id::text
                              OR allowed_change->>'from_introducer_user_id' IS DISTINCT FROM OLD.introducer_user_id::text
                              OR allowed_change->>'to_introducer_user_id' IS DISTINCT FROM NEW.introducer_user_id::text
                           THEN
                               RAISE EXCEPTION 'users.introducer_user_id change guard mismatch';
                           END IF;
                       END IF;

                       IF NEW.deleted_at IS NULL
                          AND NEW.introducer_user_id IS NULL
                          AND COALESCE(LOWER(BTRIM(NEW.username)), '') <> '{origin_username}'
                       THEN
                           RAISE EXCEPTION 'only the origin user may have a null introducer_user_id';
                       END IF;

                       IF TG_OP = 'UPDATE'
                          AND OLD.deleted_at IS NULL
                          AND OLD.introducer_user_id IS NULL
                          AND COALESCE(LOWER(BTRIM(OLD.username)), '') = '{origin_username}'
                          AND COALESCE(LOWER(BTRIM(NEW.username)), '') <> '{origin_username}'
                       THEN
                           RAISE EXCEPTION 'the origin username cannot be changed';
                       END IF;

                       RETURN NEW;
                   END;
                   $$ LANGUAGE plpgsql"#,
                origin_username = User::ORIGIN_USERNAME,
            ),
            &[],
        )
        .await?;

        Ok(())
    }

    async fn down(ctx: &MigrationContext<'_>) -> Result<()> {
        ctx.raw_execute(
            "DROP TABLE IF EXISTS admin_user_introducer_changes",
            &[],
        )
        .await?;

        ctx.raw_execute(
            &format!(
                r#"CREATE OR REPLACE FUNCTION enforce_user_introducer_rules() RETURNS TRIGGER AS $$
                   BEGIN
                       IF TG_OP = 'UPDATE'
                          AND NEW.introducer_user_id IS DISTINCT FROM OLD.introducer_user_id
                       THEN
                           RAISE EXCEPTION 'users.introducer_user_id cannot be changed once set';
                       END IF;

                       IF NEW.deleted_at IS NULL
                          AND NEW.introducer_user_id IS NULL
                          AND COALESCE(LOWER(BTRIM(NEW.username)), '') <> '{origin_username}'
                       THEN
                           RAISE EXCEPTION 'only the origin user may have a null introducer_user_id';
                       END IF;

                       IF TG_OP = 'UPDATE'
                          AND OLD.deleted_at IS NULL
                          AND OLD.introducer_user_id IS NULL
                          AND COALESCE(LOWER(BTRIM(OLD.username)), '') = '{origin_username}'
                          AND COALESCE(LOWER(BTRIM(NEW.username)), '') <> '{origin_username}'
                       THEN
                           RAISE EXCEPTION 'the origin username cannot be changed';
                       END IF;

                       RETURN NEW;
                   END;
                   $$ LANGUAGE plpgsql"#,
                origin_username = User::ORIGIN_USERNAME,
            ),
            &[],
        )
        .await?;

        Ok(())
    }
}
