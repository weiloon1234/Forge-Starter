use std::net::SocketAddr;

use axum::http::StatusCode;
use forge::prelude::*;
use forge_starter::bootstrap::{cli, http};
use forge_starter::domain::enums::AdminType;
use forge_starter::domain::models::Admin;
use forge_starter::domain::services::admin_service;
use forge_starter::ids::permissions::Permission;
use forge_starter::types::app_enum::enum_key_string;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

async fn run_cli(args: &[&str]) -> Result<()> {
    cli::builder()
        .build_cli_kernel()
        .await?
        .run_with_args(std::iter::once("forge").chain(args.iter().copied()))
        .await
}

async fn boot_app() -> Result<(AppContext, SocketAddr)> {
    std::env::set_var("SERVER__PORT", "0");

    run_cli(&["db:migrate"]).await?;
    run_cli(&["db:seed"]).await?;

    let kernel = http::builder().build_http_kernel().await?;
    let app = kernel.app().clone();
    let server = kernel.bind().await?;
    let addr = server.local_addr();

    tokio::spawn(async move {
        let _ = server.serve().await;
    });

    Ok((app, addr))
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

async fn create_admin_with_permissions(
    app: &AppContext,
    permissions: Vec<String>,
) -> Result<String> {
    let suffix = ModelId::<Admin>::generate();
    let username = format!("observer-{suffix}");
    let email = format!("{username}@localhost");

    let admin = Admin::model_create()
        .set(Admin::USERNAME, username.as_str())
        .set(Admin::EMAIL, email.as_str())
        .set(Admin::NAME, "Observability Admin")
        .set(Admin::ADMIN_TYPE, AdminType::Admin)
        .set(Admin::PASSWORD_HASH, "123456789000")
        .set(Admin::PERMISSIONS, permissions)
        .save(app)
        .await?;

    Ok(admin
        .create_token_with_abilities(
            app,
            "test",
            admin_service::effective_permission_keys(&admin),
        )
        .await?
        .access_token)
}

async fn get_status(addr: SocketAddr, path: &str, token: &str) -> Result<StatusCode> {
    let mut stream = TcpStream::connect(addr).await.map_err(Error::other)?;
    let request = format!(
        "GET {path} HTTP/1.1\r\nHost: {addr}\r\nAuthorization: Bearer {token}\r\nConnection: close\r\n\r\n"
    );

    stream
        .write_all(request.as_bytes())
        .await
        .map_err(Error::other)?;

    let mut response = Vec::new();
    stream
        .read_to_end(&mut response)
        .await
        .map_err(Error::other)?;

    let status_line = String::from_utf8(response)
        .map_err(Error::other)?
        .lines()
        .next()
        .ok_or_else(|| Error::message("missing HTTP status line"))?
        .to_string();
    let status = status_line
        .split_whitespace()
        .nth(1)
        .ok_or_else(|| Error::message("missing HTTP status code"))?
        .parse::<u16>()
        .map_err(Error::other)?;

    StatusCode::from_u16(status).map_err(Error::other)
}

#[tokio::test]
#[ignore = "requires local PostgreSQL and Redis services with the starter config"]
async fn observability_is_developer_only_even_with_permission() -> Result<()> {
    let (app, addr) = boot_app().await?;

    let developer_token = issue_admin_token(&app, "developer").await?;
    let super_admin_token = issue_admin_token(&app, "superadmin").await?;
    let admin_token =
        create_admin_with_permissions(&app, vec![enum_key_string(Permission::ObservabilityView)])
            .await?;

    assert_eq!(
        get_status(addr, "/_forge/health", &developer_token).await?,
        StatusCode::OK
    );
    assert_eq!(
        get_status(addr, "/_forge/ws/stats", &developer_token).await?,
        StatusCode::OK
    );
    assert_eq!(
        get_status(addr, "/_forge/health", &super_admin_token).await?,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        get_status(addr, "/_forge/health", &admin_token).await?,
        StatusCode::NOT_FOUND
    );

    Ok(())
}
