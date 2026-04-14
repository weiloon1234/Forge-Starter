use forge::prelude::*;
use crate::commands;

pub fn builder() -> AppBuilder {
    super::app::base().register_commands(commands::register)
}
