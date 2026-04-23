mod support;

// Integration tests for the admin badge infrastructure.
//
// These tests boot the HTTP kernel with `APP__BADGES__DEV_DUMMY=true` so the
// `DevDummyBadge` is registered (watching the `admins` table). They then
// exercise `GET /api/v1/admin/badges` under two permission shapes:
//   1. Developer admin sees `work.dev_dummy`.
//   2. Plain admin without `admins.read` does not.
//
// The third test is a skeleton for the full WS-push lifecycle (model save ->
// dispatcher -> WS publish) and is `#[ignore]`'d because the repo does not yet
// have WS-end-to-end test infrastructure. See the test's comment for what to
// change when adding it.

use axum::http::StatusCode;
use forge::prelude::*;
use forge_starter::domain::enums::AdminType;
use forge_starter::domain::models::Admin;
use serde_json::{json, Value};
use std::net::SocketAddr;
use support::{boot_api, login_seeded_developer, migrate_and_seed, reset_database, send_json};

/// Create a plain `AdminType::Admin` with an empty permission set and log in
/// as them. This is the permission shape we want for the negative snapshot
/// test: no `admins.read`, so `work.dev_dummy` must be filtered out.
async fn create_and_login_limited_admin(app: &AppContext, addr: SocketAddr) -> Result<String> {
    let password = "limited-pass-1234";
    let username = "limited-badge-admin";

    Admin::model_create()
        .set(Admin::USERNAME, username)
        .set(Admin::EMAIL, format!("{username}@localhost"))
        .set(Admin::NAME, "Limited Badge Admin")
        .set(Admin::ADMIN_TYPE, AdminType::Admin)
        .set(Admin::PASSWORD_HASH, password)
        .set(Admin::PERMISSIONS, Vec::<String>::new())
        .save(app)
        .await?;

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
            "limited admin login failed: status={status} body={body}"
        )));
    }
    body["access_token"]
        .as_str()
        .map(str::to_string)
        .ok_or_else(|| Error::message("login response missing access_token"))
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires local PostgreSQL and Redis services with the starter config"]
async fn badge_snapshot_returns_dev_dummy_count_for_developer() -> Result<()> {
    std::env::set_var("APP__BADGES__DEV_DUMMY", "true");
    reset_database().await?;
    migrate_and_seed().await?;

    let (_app, addr) = boot_api().await?;
    let token = login_seeded_developer(addr).await?;

    let (status, body) = send_json(addr, "GET", "/api/v1/admin/badges", Some(&token), None)?;
    assert_eq!(status, StatusCode::OK);

    let counts = body
        .get("counts")
        .and_then(Value::as_object)
        .expect("response should contain a 'counts' object");
    let dev_dummy = counts
        .get("work.dev_dummy")
        .and_then(Value::as_u64)
        .expect("developer admin should see work.dev_dummy count");
    // Seed guarantees at least one admin (the developer we logged in as).
    assert!(
        dev_dummy >= 1,
        "expected at least 1 admin row, got {dev_dummy}"
    );
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires local PostgreSQL and Redis services with the starter config"]
async fn badge_snapshot_omits_keys_admin_lacks_permission_for() -> Result<()> {
    std::env::set_var("APP__BADGES__DEV_DUMMY", "true");
    reset_database().await?;
    migrate_and_seed().await?;

    let (app, addr) = boot_api().await?;
    let token = create_and_login_limited_admin(&app, addr).await?;

    let (status, body) = send_json(addr, "GET", "/api/v1/admin/badges", Some(&token), None)?;
    assert_eq!(status, StatusCode::OK);

    let counts = body
        .get("counts")
        .and_then(Value::as_object)
        .expect("response should contain a 'counts' object");
    assert!(
        !counts.contains_key("work.dev_dummy"),
        "limited admin (no admins.read) should NOT see work.dev_dummy; counts were {counts:?}"
    );
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "end-to-end WS push path requires booting the WebSocket kernel and a Redis pub/sub subscriber in tests — not yet set up. When adding, consume `app.websocket()?.publish(...)` on the test side by subscribing to Redis key 'ws:channel:admin:badges' (or the framework's equivalent) and asserting the published {key, count} payload arrives within ~500 ms of creating an admin row."]
async fn model_save_publishes_badge_update_on_admin_badges_channel() -> Result<()> {
    Ok(())
}
