---
name: new-cli-command
description: Use when adding a custom CLI command to the starter — something invoked via `PROCESS=cli cargo run -- <your:command>` from a developer terminal, CI job, cron, or deploy script. Typical phrasings: "add a CLI command to import users from CSV", "admin script to backfill credit balances", "cleanup script for expired tokens", "ad-hoc script to send an announcement email", "CLI to dump / export X", "one-off maintenance command". Covers registering via `AppBuilder::register_commands`, scaffolding via `make:command`, implementing the async handler with `CommandInvocation.app()` + clap argument parsing, and conventions around command IDs, naming (`namespace:verb`), and what belongs here vs elsewhere. Do NOT use for: recurring scheduled tasks (→ `src/schedules/` — scheduler runs cron-like intervals; not yet a skill); background async work triggered by events (→ `new-event-listener` + `jobs-and-notifications`); long-running server processes (HTTP / worker / WS are kernels, not commands); modifying Forge's built-in commands (`db:migrate`, `seed:countries`, `make:migration`, etc. — those are framework-owned).
---

# New CLI Command — add a custom `cargo run --` subcommand

## When to invoke

A developer needs a CLI entry point for administrative, import, backfill, or one-off operational work. Typical phrasings:

- "add a CLI command to import users from a CSV"
- "backfill script to recalculate credit balances"
- "cleanup command for expired personal access tokens" (narrow — Forge already ships `token:prune`)
- "command to send an announcement email to all users"
- "ad-hoc CLI to dump a report / export resource state"
- "one-off maintenance script to fix data drift"
- "CLI tool for ops to grant a permission"

Do NOT invoke for:
- **Recurring scheduled tasks** — `src/schedules/` with `impl Schedule` covers interval / cron work. The scheduler process runs those; a Command is one-shot and only fires when a human / CI runs it.
- **Reactive side-effects on model save / event** — `new-event-listener` wires the trigger; it dispatches a job/notification per `jobs-and-notifications`.
- **Long-running server processes** — HTTP / Worker / Scheduler / WebSocket are kernels with their own `PROCESS=` dispatch. A Command exits when `handle` returns.
- **Overriding Forge-built-in commands** (`db:migrate`, `db:rollback`, `seed:countries`, `routes:list`, `make:migration`, `types:export`, `token:prune`, etc.) — those are framework-owned, registered automatically, not redeclarable.
- **Wrapping `make` targets** — `Makefile` is the right place for developer shell shortcuts; a Command is for ops work that needs the AppContext (database, email, jobs, services).

## Concept

Forge provides a CLI kernel (`PROCESS=cli cargo run`) that dispatches against a command registry. Every invocation creates a full `AppContext` — you have database, email, jobs, websocket, typed IDs, models, services, everything the HTTP kernel has. The only difference from a route handler is the entry point (clap arg parsing instead of axum request extraction) and the single-shot lifecycle.

The registration path:

```
main.rs (PROCESS=cli)
  → forge_starter::bootstrap::cli::builder()
  → AppBuilder::base().register_commands(commands::register)
  → src/commands/mod.rs::register(registry)
  → registry.command(CommandId, clap::Command, handler) for each of yours
```

The starter already has `src/bootstrap/cli.rs` wiring `commands::register` into `AppBuilder`. You never touch the bootstrap — your work is inside `src/commands/` and inside the `register` function.

`CommandInvocation` passed to the handler exposes:

- `inv.app() -> &AppContext` — all framework services (database, email, jobs, websocket, resolve)
- `inv.matches() -> &clap::ArgMatches` — parsed arguments defined on the `clap::Command`

Commands use clap's `Command` + `Arg` under the hood — the same crate that powers `make:migration --name foo`. You declare args on the `clap::Command`; clap validates / types them; your handler reads via `matches.get_one::<T>("key")` / `get_flag("key")`.

**Existing app-level commands in the starter: none yet.** `src/commands/mod.rs::register` is a commented example stub. This skill's first real use uncomments + replaces it.

**Framework commands always available** (from `PROCESS=cli cargo run -- help`): `config:publish`, `key:generate`, `migrate:publish`, `seed:publish`, `seed:countries`, `about`, `docs:api`, `env:publish`, `down`, `up`, `routes:list`, `db:migrate`, `db:migrate:status`, `db:rollback`, `db:seed`, `make:migration`, `make:seeder`, `make:model`, `make:job`, `make:command`, `token:prune`, `types:export`. Your app commands live alongside these in the same `help` listing.

## Prerequisites

- [ ] The work genuinely needs `AppContext` (DB, email, jobs, services). If it doesn't, a shell script or `Makefile` target is simpler.
- [ ] Any models / services the command will call exist. If not, build them first (`new-model` / regular service work).
- [ ] You have the command ID chosen — see Decision 1.

## Decisions — quick

### 1. Command ID (`namespace:verb` convention)

Match Forge's built-in style:

- Built-in DB: `db:migrate`, `db:rollback`, `db:seed`, `db:migrate:status`
- Built-in auth: `token:prune`
- Built-in framework: `config:publish`, `env:publish`, `key:generate`
- Built-in code gen: `make:migration`, `make:seeder`, `make:model`, `make:job`, `make:command`

Your app commands follow the same shape. Namespaces seen in practice:

- `import:<thing>` — data ingestion (import:users, import:products)
- `backfill:<thing>` — retroactive data work (backfill:balances)
- `cleanup:<thing>` — pruning / maintenance (cleanup:orphaned_files)
- `export:<thing>` — data extraction (export:users_csv)
- `report:<thing>` — reports / dumps (report:daily_stats)
- `send:<thing>` — outbound communication (send:announcement)
- `<feature>:<verb>` — feature-owned ops (billing:charge, merchant:activate)

Use lowercase snake_case for each segment; separator is colon, not dash.

### 2. Arguments needed

List every arg the command needs. For each:
- name (`--file`, `--user-id`, positional)
- type (string, int, bool flag, path)
- required vs optional (with default)
- help text

Keep args minimal. Commands called from cron / CI should be flag-driven; avoid interactive prompts.

### 3. Output / logging

Commands are one-shot; stdout is the UX. Default is `println!` for progress + final status. If the command is silent on success, note that (`--quiet`). If it's verbose, use `tracing` at `info` level (Forge's logger picks it up).

### 4. Exit code

Handler returns `Result<()>`. `Ok(())` = exit 0 (success), `Err(...)` = exit non-zero (failure). CI / cron tooling reads the exit code. Design the handler so a real failure produces `Err` — don't swallow errors just to print them.

## Steps

### 1. Scaffold the command file

Generate via the CLI scaffolder — never hand-create:

```bash
PROCESS=cli cargo run -- make:command --name <PascalName>
```

Example: `PROCESS=cli cargo run -- make:command --name ImportUsers` creates `src/commands/import_users.rs` with a minimal shell. The scaffolder handles filename + module wiring.

### 2. Implement the handler

Edit the generated file. The full shape — including arg parsing — is:

```rust
use async_trait::async_trait;
use forge::cli::{Command as CliCommand, CommandInvocation};
use forge::prelude::*;
use forge::support::CommandId;

pub const IMPORT_USERS: CommandId = CommandId::new("import:users");

pub fn command() -> CliCommand {
    CliCommand::new("import:users")
        .about("Import users from a CSV file")
        .arg(
            clap::Arg::new("file")
                .long("file")
                .short('f')
                .required(true)
                .help("Path to the CSV file"),
        )
        .arg(
            clap::Arg::new("dry-run")
                .long("dry-run")
                .action(clap::ArgAction::SetTrue)
                .help("Parse + validate only; skip database writes"),
        )
}

pub async fn handle(inv: CommandInvocation) -> Result<()> {
    let matches = inv.matches();
    let file: &String = matches.get_one("file").ok_or_else(|| {
        Error::message("--file is required")
    })?;
    let dry_run: bool = matches.get_flag("dry-run");

    let app = inv.app();
    let db = app.database()?;

    println!("importing users from {file} (dry_run={dry_run})...");

    // Business logic. Call services, use model builders, dispatch jobs, etc.
    //
    // Example — batch insert via model builders (not raw SQL unless the model
    //   builder genuinely can't express the operation):
    //
    //   let records = parse_csv(file)?;
    //   for record in records {
    //       if dry_run {
    //           println!("  would import: {}", record.email);
    //           continue;
    //       }
    //       crate::domain::models::User::model_create()
    //           .set(User::EMAIL, record.email)
    //           .set(User::NAME, record.name)
    //           .save(&*db)
    //           .await?;
    //       println!("  imported: {}", record.email);
    //   }

    println!("done.");
    Ok(())
}
```

Key points:

- **`CommandId`** const at the top — pattern mirrors `JobId` constants in `src/ids/jobs.rs`. You can keep the `CommandId` inline in the command file OR centralize in `src/ids/commands.rs` if you're adding many commands (the starter has a `src/ids/commands.rs` file for framework pattern consistency; follow the convention there).
- **`command()` function** returns a `clap::Command` with name + description + args. Use clap's full builder surface (`.arg`, `.subcommand`, `.arg_required_else_help`, etc.).
- **`handle(inv)`** is the async entry point. Parse args from `inv.matches()` using clap's typed `.get_one` / `.get_flag`. Use `inv.app()` for framework services.
- **Errors return `Err(Error::...)`** — CLI kernel converts to non-zero exit code and prints the error.
- **Call services, not raw SQL** — per CLAUDE.md's SSOT rule, if there's a service function for the work, use it. Commands are thin glue, same rule as route handlers.

### 3. Register in `src/commands/mod.rs`

Edit the register function:

```rust
use forge::prelude::*;

pub mod import_users;

pub fn register(registry: &mut CommandRegistry) -> Result<()> {
    registry.command(
        import_users::IMPORT_USERS,
        import_users::command(),
        import_users::handle,
    )?;

    // Add more commands here as they land.

    Ok(())
}
```

The `registry.command(id, clap_command, handler)` call:

- `id`: your `CommandId`
- `clap_command`: the `clap::Command` your `command()` function returns
- `handler`: the async `handle` function (matches `Fn(CommandInvocation) -> impl Future<Output = Result<()>>`)

Duplicate registration for the same `CommandId` errors at boot time with "command `<id>` already registered".

### 4. Run it

```bash
PROCESS=cli cargo run -- import:users --file path/to/users.csv
PROCESS=cli cargo run -- import:users --file path/to/users.csv --dry-run
PROCESS=cli cargo run -- import:users --help     # clap-generated help, shows args + about
PROCESS=cli cargo run -- help                    # lists all commands (yours + Forge's)
```

### 5. Verify

```bash
make check
make lint
PROCESS=cli cargo run -- help | grep "<your:command>"   # confirms registration
```

## Common patterns

### Long-running batch with progress

Commands often iterate thousands of rows. Emit progress periodically so the terminal isn't silent:

```rust
let total = records.len();
for (i, record) in records.into_iter().enumerate() {
    // ... process record ...
    if (i + 1) % 100 == 0 || i + 1 == total {
        println!("  processed {}/{}", i + 1, total);
    }
}
```

### Transactional import

Wrap multi-row writes in a transaction so a mid-batch failure doesn't leave partial state:

```rust
let transaction = app.begin_transaction().await?;
for record in records {
    crate::domain::models::User::model_create()
        .set(User::EMAIL, record.email)
        .save(&transaction)
        .await?;
}
transaction.commit().await?;
```

### Dispatching a job instead of doing the work inline

When the work is slow AND you want retry / queueing, the command just dispatches:

```rust
pub async fn handle(inv: CommandInvocation) -> Result<()> {
    let app = inv.app();
    app.jobs()?
        .dispatch(crate::domain::jobs::RecalculateBalances {
            user_id: inv.matches().get_one::<String>("user-id").cloned(),
        })
        .await?;
    println!("job enqueued.");
    Ok(())
}
```

Now a cron can run the command; the worker process does the actual work with full retry semantics.

### Sending a notification from a command

Ops-style "announcement" commands:

```rust
use forge::notifications::notify_queued;

pub async fn handle(inv: CommandInvocation) -> Result<()> {
    let app = inv.app();
    let subject = inv.matches().get_one::<String>("subject").unwrap();
    let body = inv.matches().get_one::<String>("body").unwrap();

    let db = app.database()?;
    let users = crate::domain::models::User::model_query().get(&*db).await?;

    for user in users {
        notify_queued(
            app,
            &user,
            &crate::domain::notifications::Announcement {
                subject: subject.clone(),
                body: body.clone(),
            },
        ).await?;
    }
    println!("notifications queued for {} users.", users.len());
    Ok(())
}
```

### Positional args

For a cleaner CLI (`cargo run -- grant:permission <admin-id> <perm>`), use positional args:

```rust
.arg(clap::Arg::new("admin-id").required(true))
.arg(clap::Arg::new("permission").required(true))
```

Read the same way: `matches.get_one::<String>("admin-id")`.

### Subcommands (rare)

If a single command has meaningfully distinct modes, clap subcommands work but are usually a signal you should split into multiple commands (`backup:create`, `backup:restore` rather than `backup` with subcommands).

## Testing

Commands are testable as integration tests. Follow the `tests/user_baseline.rs` pattern:

```rust
#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires local PostgreSQL and Redis services with the starter config"]
async fn import_users_dry_run_does_not_write() -> Result<()> {
    reset_database().await?;
    run_cli(&["db:migrate"]).await?;

    // Invoke your command via run_cli (the existing helper that builds a CLI kernel
    // and runs argv)
    run_cli(&["import:users", "--file", "tests/fixtures/users.csv", "--dry-run"]).await?;

    // Assert no rows landed
    let (app, _) = boot_api().await?;
    let count = User::model_query().count(app.database()?.as_ref()).await?;
    assert_eq!(count, 0);
    Ok(())
}
```

For simpler commands — import / cleanup — integration tests add confidence that args parse correctly and side effects happen. Skip for trivial commands (single-line operations).

## Don't

- **Don't hand-create the command file.** Use `PROCESS=cli cargo run -- make:command --name <PascalName>` — the scaffolder handles filename + initial module wiring.
- **Don't put business logic in the `handle` function.** Call services (`src/domain/services/`) for anything non-trivial. The command is glue: parse args → call service → report result. Same "thin handler" rule as HTTP routes.
- **Don't use raw SQL when a model builder covers the operation.** Commands bypass `write_mutator` if they `raw_execute` — the mutator's logic (password hashing, normalization) never runs. Use `Model::model_create().set(...).save(...)` unless you have a specific bulk-performance reason to drop to raw.
- **Don't prompt for input interactively.** Commands run in cron / CI contexts where stdin isn't a terminal. All inputs come from args (`--file`, `--user-id`, flags). If you genuinely need secrets, pass via env var — never prompt.
- **Don't use `.unwrap()` / `.expect()` in the handler.** Every fallible operation returns `Err(...)`. `.unwrap()` panics the process and leaves no structured error on stderr.
- **Don't forget the registrar call.** A command file that's compiled but not registered doesn't show up in `help`, can't be invoked. `registry.command(...)` in `src/commands/mod.rs::register` is non-negotiable.
- **Don't reuse a CommandId across two commands.** Registration fails at boot with "command `<id>` already registered". The error is clear but it's a waste of a boot cycle.
- **Don't shadow or override Forge built-ins** (`db:migrate`, `make:migration`, `token:prune`, etc.). If you need customized DB migration behavior, extend via hooks or own a wrapper command with a different ID; don't try to redeclare the framework-owned namespace.
- **Don't make commands run in production by default without a gate.** A destructive command (truncate table, delete users) should require a `--yes` or `--confirm` flag, or check `app.config().app()?.environment` before acting. Mistaken invocation on prod is the most common operational incident.
- **Don't install a new argument-parsing crate.** Forge re-exports clap; use it. Don't add `structopt`, `argh`, `pico-args`, etc.

## When this skill doesn't fit

- **Recurring / scheduled work** → `new-schedule`. CLI commands run on human invocation; schedules run on wall-clock.
- **Reactive to model save / domain event** → `new-event-listener` (trigger) + `jobs-and-notifications` (work).
- **Wrapping a local developer shortcut** → `Makefile` target; no Rust command needed.
- **Interactive TUI / wizard** — commands are non-interactive. If you need a wizard, it's a web-only flow.
- **Ad-hoc SQL query for diagnostics** → use `psql` directly or write a Rust command if it's reusable. A one-off query doesn't earn a checked-in command.
- **Customizing framework commands** — escalate. Forge owns its command namespace; extend in orthogonal ways rather than override.
