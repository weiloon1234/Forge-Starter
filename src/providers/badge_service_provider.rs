use std::sync::Arc;

use async_trait::async_trait;
use forge::database::{ModelCreatedEvent, ModelDeletedEvent, ModelUpdatedEvent};
use forge::prelude::*;

use crate::domain::badges::{BadgeDispatcher, BadgeLifecycleListener, BadgeRegistry};

pub struct BadgeServiceProvider;

#[async_trait]
impl ServiceProvider for BadgeServiceProvider {
    async fn register(&self, registrar: &mut ServiceRegistrar) -> Result<()> {
        let mut registry = BadgeRegistry::new();
        register_all_badges(&mut registry)?;
        let registry = Arc::new(registry);

        // Make the populated registry resolvable.
        registrar.singleton_arc::<BadgeRegistry>(registry.clone())?;

        // Dispatcher is built lazily on first resolve so it can capture the
        // fully-booted AppContext (which includes the WebSocketPublisher).
        registrar.factory::<BadgeDispatcher, _>(|container, app| {
            let registry = container.resolve::<BadgeRegistry>()?;
            Ok(BadgeDispatcher::new(app.clone(), registry))
        })?;

        // Wire model lifecycle events → dispatcher (via the stateless listener).
        registrar.listen_event::<ModelCreatedEvent, _>(BadgeLifecycleListener)?;
        registrar.listen_event::<ModelUpdatedEvent, _>(BadgeLifecycleListener)?;
        registrar.listen_event::<ModelDeletedEvent, _>(BadgeLifecycleListener)?;

        Ok(())
    }
}

/// Centralized registration point. Production badges go here as the features
/// that own them land. The dev-only smoke badge is registered in Task 10,
/// conditionally on an env var.
fn register_all_badges(registry: &mut BadgeRegistry) -> Result<()> {
    if std::env::var("APP__BADGES__DEV_DUMMY").is_ok_and(|v| v == "true") {
        use crate::domain::badges::dev_dummy::DevDummyBadge;
        registry.register::<DevDummyBadge>()?;
    }
    Ok(())
}
