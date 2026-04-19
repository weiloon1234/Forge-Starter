fn main() -> forge::foundation::Result<()> {
    let process = std::env::var("PROCESS").unwrap_or_default();

    // Keep explicit PROCESS routing, but make `cargo run -- <command>` work out of the box.
    if process.is_empty() && std::env::args_os().nth(1).is_some() {
        return forge_starter::bootstrap::cli::builder().run_cli();
    }

    match process.as_str() {
        "worker" => forge_starter::bootstrap::worker::builder().run_worker(),
        "scheduler" => forge_starter::bootstrap::scheduler::builder().run_scheduler(),
        "websocket" => forge_starter::bootstrap::websocket::builder().run_websocket(),
        "cli" => forge_starter::bootstrap::cli::builder().run_cli(),
        _ => forge_starter::bootstrap::http::builder().run_http(),
    }
}
