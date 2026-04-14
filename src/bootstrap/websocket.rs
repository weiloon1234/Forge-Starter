use forge::prelude::*;
use crate::realtime;

pub fn builder() -> AppBuilder {
    super::app::base().register_websocket_routes(realtime::register)
}
