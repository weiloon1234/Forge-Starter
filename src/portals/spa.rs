use std::sync::OnceLock;
use forge::prelude::*;
use axum::response::Html;

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

fn dev_html(title: &str, vite_port: u16, base: &str) -> String {
    let origin = format!("http://localhost:{vite_port}");
    format!(
        r#"<!doctype html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{title}</title>
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

fn cached_prod_html(portal: &str, cache: &OnceLock<String>) -> String {
    cache
        .get_or_init(|| {
            let path = format!("public/{portal}/index.html");
            std::fs::read_to_string(&path).unwrap_or_else(|_| {
                format!("<h1>Portal not built. Run: cd frontend/{portal} && npm run build</h1>")
            })
        })
        .clone()
}

pub async fn admin_spa(State(app): State<AppContext>) -> Html<String> {
    if is_dev(&app) {
        Html(dev_html("Admin Portal", VITE_ADMIN_PORT, "/admin/"))
    } else {
        Html(cached_prod_html("admin", &ADMIN_HTML))
    }
}

pub async fn user_spa(State(app): State<AppContext>) -> Html<String> {
    if is_dev(&app) {
        Html(dev_html("Forge Starter", VITE_USER_PORT, "/"))
    } else {
        Html(cached_prod_html("user", &USER_HTML))
    }
}
