use forge::prelude::*;
use forge::http::middleware::{Compression, Csrf};
use crate::portals;

pub fn builder() -> AppBuilder {
    super::app::base()
        .register_routes(portals::register)
        .register_routes(portals::register_spa)
        .register_middleware(Compression.build())
        .register_middleware(Cors::new().allow_any_origin().build())
        .middleware_group("api", vec![
            RateLimit::new(1000).per_hour().build(),
        ])
        .middleware_group("web", vec![
            Csrf::new().exclude("/api").build(),
            SecurityHeaders::new().build(),
        ])
        .serve_spa("public/user")
        .enable_observability()
}
