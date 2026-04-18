use crate::domain::events::listeners::dispatch_welcome_email::DispatchWelcomeEmail;
use crate::domain::events::user_registered::UserRegistered;
use async_trait::async_trait;
use forge::prelude::*;

pub struct EventServiceProvider;

#[async_trait]
impl ServiceProvider for EventServiceProvider {
    async fn register(&self, registrar: &mut ServiceRegistrar) -> Result<()> {
        registrar.listen_event::<UserRegistered, _>(DispatchWelcomeEmail)?;
        Ok(())
    }
}
