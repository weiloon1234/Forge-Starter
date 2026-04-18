use crate::commands;
use forge::prelude::*;

pub fn builder() -> AppBuilder {
    super::app::base().register_commands(commands::register)
}
