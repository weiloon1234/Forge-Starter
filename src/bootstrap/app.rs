use forge::prelude::*;
use crate::{ids, providers, validation};

pub fn base() -> AppBuilder {
    App::builder()
        .load_env()
        .load_config_dir("config")
        .register_provider(providers::AppServiceProvider)
        .register_provider(providers::EventServiceProvider)
        .register_validation_rule(ids::validation::MOBILE, validation::MobileRule)
}
