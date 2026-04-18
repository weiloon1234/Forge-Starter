use crate::realtime;
use forge::prelude::*;

pub fn builder() -> AppBuilder {
    super::app::base().register_websocket_routes(realtime::register)
}
