use crate::{commands, portals};
use forge::prelude::*;

pub fn builder() -> AppBuilder {
    super::app::base()
        .register_routes(portals::register)
        .register_commands(commands::register)
}
