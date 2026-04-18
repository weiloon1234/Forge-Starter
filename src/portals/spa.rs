use axum::response::Html;
use forge::prelude::*;
use std::sync::OnceLock;

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

/// Build runtime config JSON injected into the SPA HTML.
/// Available in JS as `window.__APP_CONFIG__`.
fn runtime_config(app: &AppContext) -> String {
    let ws = app.config().websocket().ok();
    let i18n = app.i18n().ok();
    let server = app.config().server().ok();

    let ws_url = ws.map(|c| format!("ws://{}:{}{}", c.host, c.port, c.path));
    let locales: Vec<&str> = i18n.as_ref().map(|m| m.locale_list()).unwrap_or_default();
    let default_locale = i18n.as_ref().map(|m| m.default_locale()).unwrap_or("en");
    let app_url = server
        .map(|s| format!("http://{}:{}", s.host, s.port))
        .unwrap_or_else(|| "http://127.0.0.1:3000".to_string());

    serde_json::json!({
        "app_url": app_url,
        "ws_url": ws_url,
        "locales": locales,
        "default_locale": default_locale,
    })
    .to_string()
}

fn config_script(app: &AppContext) -> String {
    format!(
        r#"<script>window.__APP_CONFIG__={};</script>"#,
        runtime_config(app)
    )
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

fn prod_html(portal: &str, cache: &OnceLock<String>, app: &AppContext) -> String {
    cache
        .get_or_init(|| {
            let path = format!("public/{portal}/index.html");
            let html = std::fs::read_to_string(&path).unwrap_or_else(|_| {
                format!("<h1>Portal not built. Run: cd frontend/{portal} && npm run build</h1>")
            });
            let config = config_script(app);
            html.replace("</head>", &format!("{config}\n</head>"))
        })
        .clone()
}

pub async fn admin_spa(State(app): State<AppContext>) -> Html<String> {
    if is_dev(&app) {
        let config = config_script(&app);
        Html(dev_html(
            "Admin Portal",
            VITE_ADMIN_PORT,
            "/admin/",
            &config,
        ))
    } else {
        Html(prod_html("admin", &ADMIN_HTML, &app))
    }
}

pub async fn user_spa(State(app): State<AppContext>) -> Html<String> {
    if is_dev(&app) {
        let config = config_script(&app);
        Html(dev_html("Forge Starter", VITE_USER_PORT, "/", &config))
    } else {
        Html(prod_html("user", &USER_HTML, &app))
    }
}
