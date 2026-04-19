use axum::http::StatusCode;
use forge::prelude::*;
use forge_starter::bootstrap::{cli, http};
use forge_starter::domain::models::User;
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

fn send_json(
    addr: SocketAddr,
    method: &str,
    path: &str,
    token: Option<&str>,
    body: Option<Value>,
) -> Result<(StatusCode, Value)> {
    let mut command = Command::new("curl");
    command
        .arg("-sS")
        .arg("--max-time")
        .arg("5")
        .arg("-X")
        .arg(method)
        .arg(format!("http://{addr}{path}"))
        .arg("-H")
        .arg("Accept: application/json");

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

    let json = if body_text.trim().is_empty() {
        Value::Null
    } else {
        serde_json::from_str(body_text).map_err(Error::other)?
    };

    Ok((status, json))
}

async fn create_user(
    app: &AppContext,
    username: Option<&str>,
    email: Option<&str>,
    name: Option<&str>,
    password: &str,
) -> Result<User> {
    User::model_create()
        .set(User::USERNAME, username.map(str::to_string))
        .set(User::EMAIL, email.map(str::to_string))
        .set(User::NAME, name.map(str::to_string))
        .set(User::PASSWORD_HASH, password)
        .set(User::PASSWORD2_HASH, "secondary-password")
        .save(app)
        .await
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires local PostgreSQL and Redis services with the starter config"]
async fn rewritten_user_baseline_supports_auth_uniqueness_and_profile_updates() -> Result<()> {
    reset_database().await?;
    run_cli(&["db:migrate"]).await?;
    run_cli(&["db:seed"]).await?;

    let (app, addr) = boot_api().await?;

    create_user(
        &app,
        Some("profileuser1"),
        Some("profile@example.com"),
        Some("Profile User"),
        "password123",
    )
    .await?;

    let (username_status, username_login) = send_json(
        addr,
        "POST",
        "/api/v1/user/auth/login",
        None,
        Some(json!({
            "login": "profileuser1",
            "password": "password123",
        })),
    )?;
    assert_eq!(username_status, StatusCode::OK);
    let username_token = username_login["access_token"]
        .as_str()
        .expect("username login should return access token")
        .to_string();

    let (email_status, email_login) = send_json(
        addr,
        "POST",
        "/api/v1/user/auth/login",
        None,
        Some(json!({
            "login": "PROFILE@EXAMPLE.COM",
            "password": "password123",
        })),
    )?;
    assert_eq!(email_status, StatusCode::OK);
    assert!(email_login["access_token"].as_str().is_some());

    let (update_status, updated_me) = send_json(
        addr,
        "PUT",
        "/api/v1/user/me",
        Some(&username_token),
        Some(json!({
            "username": "ProfileUser9",
            "name": "Primary Profile",
            "email": "Upper@Example.com",
            "country_iso2": "my",
            "contact_country_iso2": "my",
            "contact_number": " 0123456789 ",
        })),
    )?;
    assert_eq!(update_status, StatusCode::OK);
    assert_eq!(updated_me["username"], json!("ProfileUser9"));
    assert_eq!(updated_me["name"], json!("Primary Profile"));
    assert_eq!(updated_me["email"], json!("upper@example.com"));
    assert_eq!(updated_me["country_iso2"], json!("MY"));
    assert_eq!(updated_me["contact_country_iso2"], json!("MY"));
    assert_eq!(updated_me["contact_number"], json!("0123456789"));

    let (invalid_country_status, invalid_country) = send_json(
        addr,
        "PUT",
        "/api/v1/user/me",
        Some(&username_token),
        Some(json!({
            "country_iso2": "SG",
        })),
    )?;
    assert_eq!(invalid_country_status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(invalid_country["errors"][0]["field"], json!("country_iso2"));
    assert_eq!(
        invalid_country["errors"][0]["code"],
        json!("active_country")
    );

    let (clear_status, cleared_me) = send_json(
        addr,
        "PUT",
        "/api/v1/user/me",
        Some(&username_token),
        Some(json!({
            "username": "",
            "name": "",
            "email": "",
            "country_iso2": "",
            "contact_country_iso2": "",
            "contact_number": "",
        })),
    )?;
    assert_eq!(clear_status, StatusCode::OK);
    assert_eq!(cleared_me["username"], Value::Null);
    assert_eq!(cleared_me["name"], Value::Null);
    assert_eq!(cleared_me["email"], Value::Null);
    assert_eq!(cleared_me["country_iso2"], Value::Null);
    assert_eq!(cleared_me["contact_country_iso2"], Value::Null);
    assert_eq!(cleared_me["contact_number"], Value::Null);

    let soft_delete_user = create_user(
        &app,
        Some("softdelete1"),
        Some("softdelete@example.com"),
        Some("Soft Delete User"),
        "password123",
    )
    .await?;
    soft_delete_user.delete().execute(&app).await?;

    let (deleted_login_status, _) = send_json(
        addr,
        "POST",
        "/api/v1/user/auth/login",
        None,
        Some(json!({
            "login": "softdelete@example.com",
            "password": "password123",
        })),
    )?;
    assert_eq!(deleted_login_status, StatusCode::UNAUTHORIZED);

    let reusable_user = create_user(
        &app,
        Some("reusableuser"),
        Some("reusable@example.com"),
        Some("Reusable User"),
        "password123",
    )
    .await?;
    reusable_user.delete().execute(&app).await?;

    let reuse_target = create_user(
        &app,
        Some("freshuser"),
        Some("fresh@example.com"),
        Some("Fresh User"),
        "password123",
    )
    .await?;
    let reuse_token = reuse_target
        .create_token_named(&app, "reuse")
        .await?
        .access_token;

    let (reuse_status, reused_me) = send_json(
        addr,
        "PUT",
        "/api/v1/user/me",
        Some(&reuse_token),
        Some(json!({
            "username": "ReusableUser",
            "email": "Reusable@Example.com",
        })),
    )?;
    assert_eq!(reuse_status, StatusCode::OK);
    assert_eq!(reused_me["username"], json!("ReusableUser"));
    assert_eq!(reused_me["email"], json!("reusable@example.com"));

    Ok(())
}
