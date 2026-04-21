use async_trait::async_trait;
use forge::prelude::*;

use crate::domain::models::User;

pub struct Entry;

#[async_trait]
impl MigrationFile for Entry {
    async fn up(ctx: &MigrationContext<'_>) -> Result<()> {
        ctx.raw_execute(
            r#"DO $$
               DECLARE root_user_id UUID;
               BEGIN
                   SELECT id
                   INTO root_user_id
                   FROM users
                   WHERE introducer_user_id IS NULL
                     AND deleted_at IS NULL
                   ORDER BY created_at ASC, id ASC
                   LIMIT 1;

                   IF root_user_id IS NOT NULL THEN
                       UPDATE users
                       SET introducer_user_id = root_user_id,
                           updated_at = NOW()
                       WHERE introducer_user_id IS NULL
                         AND deleted_at IS NULL
                         AND id <> root_user_id;
                   END IF;
               END
               $$"#,
            &[],
        )
        .await?;

        ctx.raw_execute(
            r#"CREATE UNIQUE INDEX idx_users_single_active_null_introducer
               ON users ((1))
               WHERE introducer_user_id IS NULL
                 AND deleted_at IS NULL"#,
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

        ctx.raw_execute(
            r#"CREATE TRIGGER trg_users_enforce_introducer_rules
               BEFORE INSERT OR UPDATE ON users
               FOR EACH ROW
               EXECUTE FUNCTION enforce_user_introducer_rules()"#,
            &[],
        )
        .await?;

        Ok(())
    }

    async fn down(ctx: &MigrationContext<'_>) -> Result<()> {
        ctx.raw_execute(
            "DROP TRIGGER IF EXISTS trg_users_enforce_introducer_rules ON users",
            &[],
        )
        .await?;
        ctx.raw_execute("DROP FUNCTION IF EXISTS enforce_user_introducer_rules()", &[])
            .await?;
        ctx.raw_execute(
            "DROP INDEX IF EXISTS idx_users_single_active_null_introducer",
            &[],
        )
        .await?;

        Ok(())
    }
}
