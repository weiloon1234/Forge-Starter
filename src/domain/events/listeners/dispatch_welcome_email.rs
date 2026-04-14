use async_trait::async_trait;
use forge::prelude::*;

use crate::domain::events::user_registered::UserRegistered;
use crate::domain::jobs::SendWelcomeEmail;

pub struct DispatchWelcomeEmail;

#[async_trait]
impl EventListener<UserRegistered> for DispatchWelcomeEmail {
    async fn handle(&self, ctx: &EventContext, event: &UserRegistered) -> Result<()> {
        ctx.app().jobs()?.dispatch(SendWelcomeEmail {
            user_id: event.user_id.clone(),
            email: event.email.clone(),
        }).await?;
        Ok(())
    }
}
