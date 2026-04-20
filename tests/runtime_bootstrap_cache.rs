use axum::http::StatusCode;
use forge::prelude::*;
use forge::settings::{NewSetting, Setting};
use forge_starter::bootstrap::{cli, http};
use forge_starter::domain::models::Admin;
use forge_starter::domain::services::{admin_service, runtime_bootstrap_service};
use serde_json::{json, Value};
use std::net::SocketAddr;
use std::process::Command;

async fn run_cli(args: &[&str]) -> Result<()> {
    cli::builder()
        .build_cli_kernel()
        .await?
        .run_with_args(std::iter::once("forge").chain(args.iter().copied()))
        .await
}

async fn reset_database() -> Result<()> {
    let kernel = cli::builder().build_cli_kernel().await?;
    let db = kernel.app().database()?;

    db.raw_execute("DROP SCHEMA IF EXISTS public CASCADE", &[])
        .await?;
    db.raw_execute("CREATE SCHEMA public", &[]).await?;
    db.raw_execute("CREATE EXTENSION IF NOT EXISTS pgcrypto", &[])
        .await?;

    Ok(())
}

async fn boot_api() -> Result<(AppContext, SocketAddr)> {
    std::env::set_var("SERVER__PORT", "0");

    let kernel = http::builder().build_http_kernel().await?;
    let app = kernel.app().clone();
    let server = kernel.bind().await?;
    let addr = SocketAddr::from(([127, 0, 0, 1], server.local_addr().port()));

    tokio::spawn(async move {
        let _ = server.serve().await;
    });

    Ok((app, addr))
}

fn send_request(
    addr: SocketAddr,
    method: &str,
    path: &str,
    token: Option<&str>,
    body: Option<Value>,
    accept: &str,
) -> Result<(StatusCode, String)> {
    let mut command = Command::new("curl");
    command
        .arg("-sS")
        .arg("--max-time")
        .arg("5")
        .arg("-X")
        .arg(method)
        .arg(format!("http://{addr}{path}"))
        .arg("-H")
        .arg(format!("Accept: {accept}"));

    if let Some(token) = token {
        command
            .arg("-H")
            .arg(format!("Authorization: Bearer {token}"));
    }

    if let Some(body) = body {
        command
            .arg("-H")
            .arg("Content-Type: application/json")
            .arg("-d")
            .arg(body.to_string());
    }

    command.arg("-w").arg("\n%{http_code}");

    let output = command.output().map_err(Error::other)?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(Error::message(format!(
            "curl request failed with status {}: {}",
            output.status, stderr
        )));
    }

    let stdout = String::from_utf8(output.stdout).map_err(Error::other)?;
    let (body_text, status_text) = stdout
        .rsplit_once('\n')
        .ok_or_else(|| Error::message("curl response missing status line"))?;

    let status_code = status_text.trim().parse::<u16>().map_err(Error::other)?;
    let status = StatusCode::from_u16(status_code).map_err(Error::other)?;

    Ok((status, body_text.to_string()))
}

fn get_html(addr: SocketAddr, path: &str) -> Result<String> {
    let (status, body) = send_request(addr, "GET", path, None, None, "text/html")?;
    if status != StatusCode::OK {
        return Err(Error::message(format!(
            "expected HTML response 200, got {status}"
        )));
    }

    Ok(body)
}

fn send_json(
    addr: SocketAddr,
    method: &str,
    path: &str,
    token: Option<&str>,
    body: Option<Value>,
) -> Result<(StatusCode, Value)> {
    let (status, body_text) = send_request(addr, method, path, token, body, "application/json")?;
    let body = if body_text.trim().is_empty() {
        Value::Null
    } else {
        serde_json::from_str(&body_text).map_err(Error::other)?
    };

    Ok((status, body))
}

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

async fn issue_admin_token(app: &AppContext, username: &str) -> Result<String> {
    let db = app.database()?;
    let admin = Admin::model_query()
        .where_(Admin::USERNAME.eq(username))
        .first(&*db)
        .await?
        .ok_or_else(|| Error::message(format!("missing seeded admin `{username}`")))?;

    Ok(admin
        .create_token_with_abilities(
            app,
            "test",
            admin_service::effective_permission_keys(&admin),
        )
        .await?
        .access_token)
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires local PostgreSQL and Redis services with the starter config"]
async fn runtime_bootstrap_cache_stays_hot_and_refreshes_after_country_updates() -> Result<()> {
    reset_database().await?;
    run_cli(&["db:migrate"]).await?;
    run_cli(&["db:seed"]).await?;

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
