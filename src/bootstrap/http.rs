use crate::domain::models::Admin;
use crate::domain::services::admin_service;
use crate::ids::guards::Guard;
use crate::ids::permissions::Permission;
use crate::portals;
use forge::http::middleware::{Compression, Csrf};
use forge::prelude::*;

pub fn builder() -> AppBuilder {
    super::app::base()
        .register_routes(portals::register)
        .register_routes(portals::register_spa)
        .register_middleware(Compression.build())
        .register_middleware(Cors::new().allow_any_origin().build())
        .middleware_group("api", vec![RateLimit::new(1000).per_hour().build()])
        .middleware_group(
            "web",
            vec![
                Csrf::new().exclude("/api").build(),
                SecurityHeaders::new().build(),
            ],
        )
        .enable_observability_with(
            ObservabilityOptions::new()
                .guard(Guard::Admin)
                .permission(Permission::ObservabilityView)
                .authorize(|ctx| async move {
                    let admin = ctx
                        .resolve_actor::<Admin>()
                        .await?
                        .ok_or_else(|| Error::not_found("Not found"))?;

                    if !admin_service::can_access_observability(&admin) {
                        return Err(Error::not_found("Not found"));
                    }

                    Ok(())
                }),
        )
}
