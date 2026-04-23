use crate::domain::models::Country;
use crate::support::i18n::{available_locales, default_locale};
use forge::countries::CountryStatus;
use forge::prelude::*;
use forge::settings::Setting;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
use std::time::Duration;

pub const RUNTIME_BOOTSTRAP_CACHE_KEY: &str = "runtime_bootstrap:v1";

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RuntimeCountry {
    pub iso2: String,
    pub name: String,
    pub flag_emoji: Option<String>,
    pub calling_code: Option<String>,
    pub is_default: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RuntimeBootstrap {
    pub app_url: String,
    pub ws_url: Option<String>,
    pub locales: Vec<String>,
    pub default_locale: String,
    pub settings: BTreeMap<String, Value>,
    pub countries: Vec<RuntimeCountry>,
}

pub async fn load(app: &AppContext) -> Result<RuntimeBootstrap> {
    if let Some(cached) = cached_runtime_bootstrap(app).await {
        return Ok(cached);
    }

    let payload = build_runtime_bootstrap(app).await?;
    let _ = store_runtime_bootstrap(app, &payload).await;

    Ok(payload)
}

pub async fn refresh(app: &AppContext) -> Result<RuntimeBootstrap> {
    let payload = build_runtime_bootstrap(app).await;

    let _ = invalidate(app).await;

    match payload {
        Ok(payload) => {
            let _ = store_runtime_bootstrap(app, &payload).await;
            Ok(payload)
        }
        Err(error) => Err(error),
    }
}

pub async fn invalidate(app: &AppContext) -> Result<()> {
    let Ok(cache) = app.cache() else {
        return Ok(());
    };

    let _ = cache.forget(RUNTIME_BOOTSTRAP_CACHE_KEY).await?;
    Ok(())
}

async fn cached_runtime_bootstrap(app: &AppContext) -> Option<RuntimeBootstrap> {
    let cache = app.cache().ok()?;
    cache
        .get::<RuntimeBootstrap>(RUNTIME_BOOTSTRAP_CACHE_KEY)
        .await
        .ok()
        .flatten()
}

async fn store_runtime_bootstrap(app: &AppContext, payload: &RuntimeBootstrap) -> Result<()> {
    let Ok(cache) = app.cache() else {
        return Ok(());
    };

    cache
        .put(
            RUNTIME_BOOTSTRAP_CACHE_KEY,
            payload,
            runtime_bootstrap_ttl(app),
        )
        .await
}

fn runtime_bootstrap_ttl(app: &AppContext) -> Duration {
    let seconds = app
        .config()
        .cache()
        .map(|cache| cache.ttl_seconds)
        .unwrap_or(3600)
        .max(1);

    Duration::from_secs(seconds)
}

async fn build_runtime_bootstrap(app: &AppContext) -> Result<RuntimeBootstrap> {
    let ws = app.config().websocket().ok();
    let server = app.config().server().ok();

    let ws_url = ws.map(|config| format!("ws://{}:{}{}", config.host, config.port, config.path));
    let locales = available_locales(app);
    let default_locale = default_locale(app);
    let app_url = server
        .map(|config| format!("http://{}:{}", config.host, config.port))
        .unwrap_or_else(|| "http://127.0.0.1:3000".to_string());

    Ok(RuntimeBootstrap {
        app_url,
        ws_url,
        locales,
        default_locale,
        settings: load_public_settings(app).await?,
        countries: load_enabled_countries(app).await?,
    })
}

async fn load_public_settings(app: &AppContext) -> Result<BTreeMap<String, Value>> {
    let settings = Setting::public(app).await?;
    let mut values = BTreeMap::new();

    for setting in settings {
        values.insert(setting.key, setting.value.unwrap_or(Value::Null));
    }

    Ok(values)
}

async fn load_enabled_countries(app: &AppContext) -> Result<Vec<RuntimeCountry>> {
    let countries = Country::model_query()
        .where_(Country::STATUS.eq(CountryStatus::Enabled))
        .order_by(Country::NAME.asc())
        .get(app)
        .await?;

    Ok(countries
        .into_iter()
        .map(|country| RuntimeCountry {
            iso2: country.iso2,
            name: country.name,
            flag_emoji: country.flag_emoji,
            calling_code: country.calling_code,
            is_default: country.is_default,
        })
        .collect())
}
