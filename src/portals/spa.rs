use axum::response::Html;
use forge::prelude::*;
use std::sync::OnceLock;

use crate::domain::services::runtime_bootstrap_service;

// Vite dev server ports — must match vite.config.ts server.port
const VITE_ADMIN_PORT: u16 = 5173;
const VITE_USER_PORT: u16 = 5174;

// Production HTML cache — read once, serve forever
static ADMIN_HTML: OnceLock<String> = OnceLock::new();
static USER_HTML: OnceLock<String> = OnceLock::new();

fn is_dev(app: &AppContext) -> bool {
    app.config()
        .app()
        .map(|c| c.environment.is_development())
        .unwrap_or(false)
}

async fn config_script(app: &AppContext) -> Result<String> {
    let config = runtime_bootstrap_service::load(app).await?;
    let serialized = serde_json::to_string(&config).map_err(Error::other)?;
    Ok(format!(
        r#"<script>window.__APP_CONFIG__={serialized};</script>"#
    ))
}

fn dev_html(title: &str, vite_port: u16, base: &str, config: &str) -> String {
    let origin = format!("http://localhost:{vite_port}");
    format!(
        r#"<!doctype html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{title}</title>
    {config}
</head>
<body>
    <div id="root"></div>
    <script type="module">
        import RefreshRuntime from "{origin}{base}@react-refresh";
        RefreshRuntime.injectIntoGlobalHook(window);
        window.$RefreshReg$ = () => {{}};
        window.$RefreshSig$ = () => (type) => type;
        window.__vite_plugin_react_preamble_installed__ = true;
    </script>
    <script type="module" src="{origin}{base}@vite/client"></script>
    <script type="module" src="{origin}{base}src/main.tsx"></script>
</body>
</html>"#
    )
}

fn prod_html(portal: &str, cache: &OnceLock<String>) -> String {
    cache
        .get_or_init(|| {
            let path = format!("public/{portal}/index.html");
            std::fs::read_to_string(&path).unwrap_or_else(|_| {
                format!("<h1>Portal not built. Run: cd frontend/{portal} && npm run build</h1>")
            })
        })
        .clone()
}

fn inject_config(html: &str, config: &str) -> String {
    html.replace("</head>", &format!("{config}\n</head>"))
}

pub async fn admin_spa(State(app): State<AppContext>) -> Result<Html<String>> {
    let config = config_script(&app).await?;

    if is_dev(&app) {
        Ok(Html(dev_html(
            "Admin Portal",
            VITE_ADMIN_PORT,
            "/admin/",
            &config,
        )))
    } else {
        Ok(Html(inject_config(
            &prod_html("admin", &ADMIN_HTML),
            &config,
        )))
    }
}

pub async fn user_spa(State(app): State<AppContext>) -> Result<Html<String>> {
    let config = config_script(&app).await?;

    if is_dev(&app) {
        Ok(Html(dev_html(
            "Forge Starter",
            VITE_USER_PORT,
            "/",
            &config,
        )))
    } else {
        Ok(Html(inject_config(&prod_html("user", &USER_HTML), &config)))
    }
}
