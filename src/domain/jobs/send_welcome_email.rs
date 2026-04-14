use async_trait::async_trait;
use forge::prelude::*;
use serde::{Deserialize, Serialize};

use crate::ids::jobs::SEND_WELCOME_EMAIL;

#[derive(Debug, Serialize, Deserialize)]
pub struct SendWelcomeEmail {
    pub user_id: String,
    pub email: String,
}

#[async_trait]
impl Job for SendWelcomeEmail {
    const ID: JobId = SEND_WELCOME_EMAIL;

    async fn handle(&self, ctx: JobContext) -> Result<()> {
        let email_manager = ctx.app().email()?;
        email_manager
            .send(
                EmailMessage::new("Welcome to Forge Starter!")
                    .to(self.email.as_str())
                    .text_body("Thanks for signing up. We're glad to have you."),
            )
            .await
    }
}
