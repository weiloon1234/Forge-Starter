fn main() -> forge::foundation::Result<()> {
    match std::env::var("PROCESS").unwrap_or_default().as_str() {
        "worker" => forge_starter::bootstrap::worker::builder().run_worker(),
        "scheduler" => forge_starter::bootstrap::scheduler::builder().run_scheduler(),
        "websocket" => forge_starter::bootstrap::websocket::builder().run_websocket(),
        "cli" => forge_starter::bootstrap::cli::builder().run_cli(),
        _ => forge_starter::bootstrap::http::builder().run_http(),
    }
}
