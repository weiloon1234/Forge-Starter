use forge::prelude::*;
use crate::ids;

pub fn register(registrar: &mut WebSocketRegistrar) -> Result<()> {
    registrar.channel_with_options(
        ids::channels::NOTIFICATIONS,
        |context: WebSocketContext, payload: serde_json::Value| async move {
            context.publish(ids::channels::NOTIFICATION_EVENT, payload).await
        },
        WebSocketChannelOptions::new().guard(ids::guards::Guard::User),
    )?;

    Ok(())
}
