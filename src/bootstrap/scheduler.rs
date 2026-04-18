use crate::schedules;
use forge::prelude::*;

pub fn builder() -> AppBuilder {
    super::app::base().register_schedule(schedules::register)
}
