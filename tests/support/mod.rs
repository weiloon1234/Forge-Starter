#![allow(dead_code)]

use axum::http::StatusCode;
use forge::prelude::*;
use forge_starter::bootstrap::{cli, http};
use forge_starter::domain::models::Admin;
use forge_starter::domain::services::admin_service;
use serde_json::{json, Value};
use std::net::SocketAddr;
use std::process::Command;

pub async fn run_cli(args: &[&str]) -> Result<()> {
    cli::builder()
        .build_cli_kernel()
        .await?
        .run_with_args(std::iter::once("forge").chain(args.iter().copied()))
        .await
}

pub async fn migrate_and_seed() -> Result<()> {
    run_cli(&["db:migrate"]).await?;
    run_cli(&["db:seed"]).await?;
    Ok(())
}

pub async fn reset_database() -> Result<()> {
    let kernel = cli::builder().build_cli_kernel().await?;
    let db_url = kernel.app().config().database()?.url.clone();
    forge::testing::assert_safe_to_wipe(&db_url)?;

    let db = kernel.app().database()?;

    db.raw_execute("DROP SCHEMA IF EXISTS public CASCADE", &[])
        .await?;
    db.raw_execute("CREATE SCHEMA public", &[]).await?;
    db.raw_execute("CREATE EXTENSION IF NOT EXISTS pgcrypto", &[])
        .await?;

    Ok(())
}

pub async fn boot_api() -> Result<(AppContext, SocketAddr)> {
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

pub fn send_request(
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

pub fn get_html(addr: SocketAddr, path: &str) -> Result<String> {
    let (status, body) = send_request(addr, "GET", path, None, None, "text/html")?;
    if status != StatusCode::OK {
        return Err(Error::message(format!(
            "expected HTML response 200, got {status}"
        )));
    }

    Ok(body)
}

pub fn send_json(
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

pub async fn issue_admin_token(app: &AppContext, username: &str) -> Result<String> {
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

pub async fn login_admin(addr: SocketAddr, username: &str, password: &str) -> Result<String> {
    let (status, body) = send_json(
        addr,
        "POST",
        "/api/v1/admin/auth/login",
        None,
        Some(json!({
            "username": username,
            "password": password,
        })),
    )?;

    if status != StatusCode::OK {
        return Err(Error::message(format!(
            "admin login failed: status={status} body={body}"
        )));
    }

    body["access_token"]
        .as_str()
        .map(str::to_string)
        .ok_or_else(|| Error::message("login response missing access_token"))
}

pub async fn login_seeded_developer(addr: SocketAddr) -> Result<String> {
    login_admin(addr, "developer", "123456789000").await
}
