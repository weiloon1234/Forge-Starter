mod support;

use axum::http::StatusCode;
use forge::prelude::*;
use forge::settings::{NewSetting, Setting};
use forge_starter::domain::services::runtime_bootstrap_service;
use serde_json::{json, Value};
use support::{boot_api, get_html, issue_admin_token, migrate_and_seed, reset_database, send_json};

fn extract_app_config(html: &str) -> Result<Value> {
    let prefix = "window.__APP_CONFIG__=";
    let start = html
        .find(prefix)
        .ok_or_else(|| Error::message("runtime config script missing"))?
        + prefix.len();
    let suffix = html[start..]
        .find(";</script>")
        .ok_or_else(|| Error::message("runtime config script terminator missing"))?;
    let payload = &html[start..start + suffix];

    serde_json::from_str(payload).map_err(Error::other)
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires local PostgreSQL and Redis services with the starter config"]
async fn runtime_bootstrap_cache_stays_hot_and_refreshes_after_country_updates() -> Result<()> {
    reset_database().await?;
    migrate_and_seed().await?;

    let (app, addr) = boot_api().await?;
    let cache = app.cache()?;
    cache
        .forget(runtime_bootstrap_service::RUNTIME_BOOTSTRAP_CACHE_KEY)
        .await?;

    Setting::create(
        &app,
        NewSetting::new("public.banner", "Public Banner")
            .value(json!("Old Banner"))
            .is_public(true),
    )
    .await?;

    let first_config = extract_app_config(&get_html(addr, "/")?)?;
    assert_eq!(
        first_config["settings"]["public.banner"],
        json!("Old Banner")
    );
    assert_eq!(first_config["countries"][0]["iso2"], json!("MY"));

    let cached_bootstrap: Option<Value> = cache
        .get(runtime_bootstrap_service::RUNTIME_BOOTSTRAP_CACHE_KEY)
        .await?;
    assert!(cached_bootstrap.is_some());

    Setting::set(&app, "public.banner", json!("New Banner")).await?;

    let second_config = extract_app_config(&get_html(addr, "/")?)?;
    assert_eq!(
        second_config["settings"]["public.banner"],
        json!("Old Banner")
    );

    let developer_token = issue_admin_token(&app, "developer").await?;
    let (update_status, _) = send_json(
        addr,
        "PUT",
        "/api/v1/admin/countries/MY",
        Some(&developer_token),
        Some(json!({
            "status": "disabled",
            "conversion_rate": Value::Null,
            "is_default": true,
        })),
    )?;
    assert_eq!(update_status, StatusCode::OK);

    let third_config = extract_app_config(&get_html(addr, "/")?)?;
    assert_eq!(
        third_config["settings"]["public.banner"],
        json!("New Banner")
    );
    assert_eq!(third_config["countries"].as_array().map(Vec::len), Some(0));

    Ok(())
}
