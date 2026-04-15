use async_trait::async_trait;
use forge::prelude::*;

pub struct Entry;

#[async_trait]
impl SeederFile for Entry {
    async fn run(ctx: &SeederContext<'_>) -> Result<()> {
        let hash = ctx.app().hash()?;

        let admins: Vec<(&str, &str, &str, &str, &str)> = vec![
            // (username, email, name, admin_type, password)
            ("developer", "developer@localhost", "Developer", "developer", "123456789000"),
            ("superadmin", "superadmin@localhost", "Super Admin", "super_admin", "qweasd123"),
        ];

        for (username, email, name, admin_type, password) in admins {
            let password_hash = hash.hash(password)?;

            ctx.raw_execute(
                r#"INSERT INTO admins (username, email, name, admin_type, password_hash)
                   VALUES ($1, $2, $3, $4, $5)
                   ON CONFLICT (username) DO NOTHING"#,
                &[
                    DbValue::Text(username.into()),
                    DbValue::Text(email.into()),
                    DbValue::Text(name.into()),
                    DbValue::Text(admin_type.into()),
                    DbValue::Text(password_hash),
                ],
            )
            .await?;

            println!("  seeded admin: {username} ({admin_type})");
        }

        Ok(())
    }
}
