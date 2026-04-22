---
name: testing
description: Use when writing or extending test coverage for backend code — pure-function unit tests inside `src/domain/services/<name>_service.rs`, or end-to-end integration tests under `tests/<scenario>.rs` that boot the real HTTP kernel + real Postgres and hit endpoints with authentic auth tokens. Typical phrasings include "add a test for the admin service authorization", "integration test for /admin/X", "cover the permission gate on Y", "test the WS-token endpoint", "write unit tests for Z service". Covers decision (unit vs integration), the shared boilerplate (`reset_database` / `run_cli` / `boot_api` / `send_json`), authenticated-request patterns, fixture construction, and test-database safety. Does NOT cover frontend component or E2E tests (no vitest / playwright set up yet), benchmarks, property-based tests, or Forge framework tests.
---

# Testing — add or extend backend test coverage

## When to invoke

A user asks for test coverage on backend Rust code. Typical phrasings:

- "add a test for `admin_service::can_manage_target`"
- "integration test for `POST /api/v1/admin/admins`"
- "test the permission gate on the users datatable"
- "cover `credit_service::adjust` with unit tests"
- "verify the WS-token endpoint rejects expired admins"

Do NOT invoke for:
- **Frontend component / hook / E2E tests** — no vitest / playwright / jest configured in this repo yet; escalate. A future `frontend-testing` skill will fill this.
- **Benchmarks, property-based tests, fuzz** — starter does not host these yet; escalate.
- **Tests for the Forge framework itself** — those live in the Forge repo, not here.
- **One-off manual QA scripts** — if it's not `cargo test`–driven, use `new-cli-command`.

## Concept

Two test shapes live in this starter, and only two — match them exactly:

| Shape | Where | What it exercises | DB? | Runs under |
|---|---|---|---|---|
| **Unit** | tail of `src/domain/services/<name>_service.rs` (or any module) inside `#[cfg(test)] mod tests { ... }` | Pure functions — predicates, pure calculations, enum reductions, permission-decision helpers | No | `cargo test --lib` |
| **Integration** | `tests/<scenario>.rs` (separate `.rs` per scenario) | HTTP endpoint end-to-end — auth, middleware, handler, service, DB, response shape | Yes, real Postgres | `cargo test --test <scenario>` |

The two shapes are separated on purpose. Unit tests are fast, deterministic, no setup — use them for anything that doesn't need a DB row. Integration tests are slow (seconds per test, not ms), mutate real DB state, and should be reserved for behavior that crosses the HTTP boundary.

**Deeper references** (read only if the procedure below is unclear):
- Unit test exemplars: `src/domain/services/admin_service.rs` (bottom), `src/domain/services/credit_service.rs`, `src/domain/services/page_service.rs`
- Integration test exemplars: `tests/user_baseline.rs`, `tests/admin_badges.rs`, `tests/observability_access.rs`

## Critical safety rule — test DB

**Integration tests DROP and recreate the `public` schema** of whatever database `DATABASE__URL` points at. If your `.env` points at your dev database, running `cargo test` will wipe your dev data.

Before running integration tests:

1. Either point `DATABASE__URL` at a separate test database:
   ```bash
   DATABASE__URL=postgres://user:pass@localhost/<app>_test cargo test
   ```
2. Or create a `.env.test` that overrides `DATABASE__URL` and load it via your shell before running tests (e.g., `set -a && source .env.test && set +a && cargo test`).

The starter does not ship a `make test` target — adding one that enforces a test DB url is a reasonable follow-up. Today, it's your responsibility.

## Decisions — answer before writing code

1. **Test shape** — does the behavior being tested cross the HTTP boundary? Yes → integration. No → unit.
2. **Actor type** — if integration: developer admin (bypass all RBAC, simplest), plain admin with specific `permissions: Vec<String>` (for gating tests), or end-user (`User` via `/api/v1/user/...`).
3. **Seed state** — does the test need the default seed (`run_cli(&["db:seed"]).await?`), or a hand-built DB state (construct rows in the test with `<Model>::model_create()`)?
4. **Feature flags** — any per-test env needed (e.g., `APP__BADGES__DEV_DUMMY=true`)? Set via `std::env::set_var` before booting the kernel.
5. **Unique test db** — confirm you've overridden `DATABASE__URL` for this test run (see safety rule above).

## Core steps — unit test (pure function)

A unit test belongs in the SAME file as the function under test, inside `#[cfg(test)] mod tests`. Keep the fixture builders local unless they're genuinely shared.

### 1. Add the test module at the bottom of the service file

Template (mirror `src/domain/services/admin_service.rs:372`):

```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn <model>_fixture(id: ModelId<<Model>>, <param>: <Type>) -> <Model> {
        <Model> {
            id,
            <field>: <value>,
            // ... every non-Option field on the model. Construct directly —
            // unit tests don't go through model_create, so you are responsible
            // for all required columns.
            created_at: DateTime::now(),
            updated_at: DateTime::now(),
            deleted_at: None,
        }
    }

    #[test]
    fn <describes_what_is_being_asserted>() {
        let actor = <model>_fixture(ModelId::generate(), <...>);
        let target = <model>_fixture(ModelId::generate(), <...>);

        assert!(<function_under_test>(&actor, &target));
        assert!(!<other_function>(&actor, &target));
    }
}
```

**Rules:**
- One `#[test]` fn per behavior; fn name reads as the assertion ("developer_can_view_super_admin_but_not_other_developer_rows").
- Use `<Model>::model_id::ModelId::generate()` to avoid collisions between fixtures.
- Async unit tests go through `#[tokio::test]` instead of `#[test]` — only when the function under test is itself `async`. Most authorization predicates are sync; keep them that way.
- Fixtures construct the struct directly. Do NOT call `model_create()` — that requires a DB; this test doesn't have one.

### 2. Run the test

```bash
cargo test --lib                          # all library unit tests
cargo test --lib <module>::tests::        # a whole module
cargo test --lib <test_fn_name>           # a single test by name
```

Expected: green. If it fails, fix the function or the assertion — never adjust the assertion to make a real bug pass.

## Core steps — integration test (HTTP end-to-end)

One `.rs` file per scenario. Shared boilerplate is duplicated across existing files today (see "Shared helpers" below — extracting them into `tests/common/mod.rs` is a legitimate cleanup).

### 1. Create `tests/<scenario>.rs`

Template (mirror `tests/user_baseline.rs:1`):

```rust
use axum::http::StatusCode;
use forge::prelude::*;
use forge_starter::bootstrap::{cli, http};
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
    db.raw_execute("DROP SCHEMA IF EXISTS public CASCADE", &[]).await?;
    db.raw_execute("CREATE SCHEMA public", &[]).await?;
    db.raw_execute("CREATE EXTENSION IF NOT EXISTS pgcrypto", &[]).await?;
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
        .arg("-sS").arg("--max-time").arg("5")
        .arg("-X").arg(method)
        .arg(format!("http://{addr}{path}"))
        .arg("-H").arg("Accept: application/json");

    if let Some(token) = token {
        command.arg("-H").arg(format!("Authorization: Bearer {token}"));
    }
    if let Some(body) = body {
        command
            .arg("-H").arg("Content-Type: application/json")
            .arg("-d").arg(body.to_string());
    }
    command.arg("-w").arg("\n%{http_code}");

    let output = command.output().map_err(Error::other)?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(Error::message(format!(
            "curl request failed with status {}: {}", output.status, stderr,
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

#[tokio::test]
async fn <scenario_name>() -> Result<()> {
    reset_database().await?;
    run_cli(&["db:migrate"]).await?;
    run_cli(&["db:seed"]).await?;

    let (_app, addr) = boot_api().await?;

    // 1. Log in (developer admin — seeded by db:seed).
    let (status, body) = send_json(
        addr,
        "POST",
        "/api/v1/admin/auth/login",
        None,
        Some(json!({ "username": "dev", "password": "password" })),
    )?;
    assert_eq!(status, StatusCode::OK);
    let token = body["access_token"].as_str().expect("access_token").to_string();

    // 2. Hit the endpoint under test.
    let (status, body) = send_json(
        addr,
        "GET",
        "/api/v1/admin/<resource>",
        Some(&token),
        None,
    )?;
    assert_eq!(status, StatusCode::OK);

    // 3. Assert what matters. Avoid brittle full-body compares; assert the
    //    specific fields this test is about.
    assert_eq!(body["total"], json!(<expected>));
    assert!(body["rows"].is_array());

    Ok(())
}
```

**Rules:**
- ONE `#[tokio::test]` per `.rs` file for most cases. Multiple tests in one file share the same DB state machine (reset + migrate + seed), so put independent scenarios in separate files.
- If multiple tests DO share a file, call `reset_database().await?` at the start of each — tests must not rely on a previous test's leftover state.
- `SERVER__PORT=0` picks a random port. Never hardcode a port in tests.
- Auth token is Bearer. Reuse the `send_json` helper with `Some(&token)`.
- Assert on the specific fields this test is about, not full JSON equality. Full equality breaks on unrelated schema growth (new response field).

### 2. Run the test

```bash
DATABASE__URL=postgres://.../app_test \    # ← REQUIRED — see safety rule
cargo test --test <scenario_name>
```

Expected: green.

## Authenticated requests — the three actor shapes

1. **Developer admin** (bypass all RBAC) — already seeded by `db:seed`. Log in as `dev` / `password`. Use this unless the test is specifically about permission gating.
2. **Plain admin with specific permissions** — seeder doesn't create one. Build in-test:
   ```rust
   let admin = Admin::model_create()
       .set(Admin::USERNAME, "test_admin")
       .set(Admin::EMAIL, "test@example.com")
       .set(Admin::NAME, "Test Admin")
       .set(Admin::ADMIN_TYPE, AdminType::Admin)
       .set(Admin::PERMISSIONS, vec!["users.read".to_string()])
       .set(Admin::PASSWORD_HASH, hash_password("password"))
       .save(&*app.database()?)
       .await?;
   ```
   Then log in via the login endpoint to get a token bound to THAT admin.
3. **End user** (User portal) — seeder may create one; check `database/seeders/`. If not, construct with `User::model_create()` the same way as admin.

## Shared helpers — when to extract

The four helpers (`run_cli`, `reset_database`, `boot_api`, `send_json`) are duplicated across `tests/user_baseline.rs`, `tests/admin_badges.rs`, and `tests/observability_access.rs`. The duplication is acceptable today because every file needs them and there are only three, but once a fourth integration test arrives, extract them to `tests/common/mod.rs`:

```
tests/
├── common/
│   └── mod.rs       # run_cli, reset_database, boot_api, send_json, login helpers
├── admin_badges.rs  # use the helpers via: mod common; use common::*;
└── ...
```

`tests/common/mod.rs` is a Cargo convention — it's NOT built as its own integration test binary because it lacks `#[cfg(test)]`-root structure; instead, other test files declare `mod common;`.

## Verify

For a unit test:
```bash
cargo test --lib <fn_name>              # target fn only
cargo test --lib                         # all unit tests
```

For an integration test:
```bash
DATABASE__URL=postgres://.../app_test \
cargo test --test <file_stem> -- --nocapture   # --nocapture surfaces println! for debugging
```

Full pass before handoff:
```bash
DATABASE__URL=postgres://.../app_test \
cargo test                               # unit + all integration
make lint                                # rustfmt + clippy + Biome (frontend still lints)
```

If any test fails intermittently (race, port collision, timing), fix the flake — don't retry. Flaky tests are worse than no tests.

## Don't

- **Don't run integration tests against your dev DB.** They drop + recreate the schema. You will lose data. Set `DATABASE__URL` to a dedicated test DB.
- **Don't share DB state across tests.** Each integration test starts with `reset_database() + db:migrate + (optionally) db:seed`.
- **Don't hardcode a port.** Use `SERVER__PORT=0` and read the actual port from `server.local_addr()`.
- **Don't mock the database.** The starter's baseline is real Postgres. Mocking hides SQL / migration / enum-encoding bugs that integration tests catch.
- **Don't assert full JSON equality.** Pick the fields under test. Full-body asserts break every time a schema grows.
- **Don't put multiple independent scenarios in one `.rs` file.** Scenarios that share expensive setup can co-exist; truly independent flows get their own file.
- **Don't write unit tests that touch `AppContext` / `database()` / `notify()`.** That's integration territory; move the test to `tests/`.
- **Don't re-authenticate for every request in the same test.** Log in once, reuse the token.
- **Don't inline the login body on every test.** If you repeat it, promote it to a helper alongside `send_json`.
- **Don't extract shared helpers to a non-`common/` path.** Cargo treats every other `.rs` in `tests/` as its own integration binary — `mod.rs` inside `tests/common/` is the idiomatic home.

## When this skill doesn't fit

- **Frontend component / hook / integration tests** → no framework configured (no `vitest.config.*`, no `playwright.config.*`, no `"test"` script in any `package.json`). Escalate; a future `frontend-testing` skill will stand this up.
- **Benchmarks** (`#[bench]` / criterion) → not set up.
- **Property-based tests** (proptest / quickcheck) → not set up.
- **Load / stress tests** → not set up.
- **Schema-only migration tests** → out of scope; test shapes this skill covers assume migrations already exist.
- **Testing Forge framework internals** → lives in the Forge repo, not this one.
