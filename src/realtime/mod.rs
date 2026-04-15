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

    registrar.channel_with_options(
        ids::channels::ADMIN_PRESENCE,
        |_context: WebSocketContext, _payload: serde_json::Value| async move { Ok(()) },
        WebSocketChannelOptions::new()
            .guard(ids::guards::Guard::Admin)
            .presence(true),
    )?;

    Ok(())
}
