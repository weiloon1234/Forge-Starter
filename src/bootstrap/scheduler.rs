use forge::prelude::*;
use crate::schedules;

pub fn builder() -> AppBuilder {
    super::app::base().register_schedule(schedules::register)
}
