use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

fn unique_fixture_root(name: &str) -> PathBuf {
    std::env::temp_dir().join(format!(
        "forge_starter_guardrails_{name}_{}_{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time before unix epoch")
            .as_nanos()
    ))
}

fn write_file(root: &Path, relative: &str, contents: &str) {
    let path = root.join(relative);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("create parent directories");
    }
    fs::write(path, contents).expect("write fixture file");
}

fn permission_key() -> String {
    [String::from("users"), String::from("read")].join(".")
}

fn page_header_class() -> String {
    [
        String::from("sf"),
        String::from("page"),
        String::from("header"),
    ]
    .join("-")
}

fn helper_definition(name: &str) -> String {
    format!("pub async {} {}() {{}}\n", "fn", name)
}

fn seed_allowed_fixture(root: &Path) {
    write_file(
        root,
        "frontend/admin/src/permissions.ts",
        &format!(
            "export const permissions = {{ users: {{ read: \"{}\" }} }};\n",
            permission_key()
        ),
    );
    write_file(
        root,
        "frontend/admin/src/components/AdminPageHeader.tsx",
        &format!(
            "export function AdminPageHeader() {{ return <div className=\"{}\" />; }}\n",
            page_header_class()
        ),
    );
    write_file(root, "tests/support/mod.rs", &helper_definition("run_cli"));
}

fn run_guardrails(root: &Path) -> std::process::Output {
    Command::new("bash")
        .arg(Path::new(env!("CARGO_MANIFEST_DIR")).join("scripts/check-starter-guardrails.sh"))
        .arg(root)
        .output()
        .expect("run guardrail script")
}

#[test]
fn starter_guardrails_allow_canonical_sources() {
    let root = unique_fixture_root("allow");
    seed_allowed_fixture(&root);

    let output = run_guardrails(&root);
    let stderr = String::from_utf8_lossy(&output.stderr);

    fs::remove_dir_all(&root).expect("remove fixture root");

    assert!(
        output.status.success(),
        "guardrail script should pass canonical sources: {stderr}"
    );
}

#[test]
fn starter_guardrails_reject_inline_permission_literals() {
    let root = unique_fixture_root("permissions");
    seed_allowed_fixture(&root);
    write_file(
        &root,
        "frontend/admin/src/pages/UsersPage.tsx",
        &format!(
            "export const route = {{ permission: \"{}\" }};\n",
            permission_key()
        ),
    );

    let output = run_guardrails(&root);
    let stderr = String::from_utf8_lossy(&output.stderr);

    fs::remove_dir_all(&root).expect("remove fixture root");

    assert!(!output.status.success(), "guardrail script should fail");
    assert!(stderr.contains("inline admin permission literals"));
}

#[test]
fn starter_guardrails_reject_duplicated_test_helpers_and_raw_headers() {
    let root = unique_fixture_root("helpers_headers");
    seed_allowed_fixture(&root);
    write_file(&root, "tests/example.rs", &helper_definition("send_json"));
    write_file(
        &root,
        "frontend/admin/src/pages/LogsPage.tsx",
        &format!(
            "export function LogsPage() {{ return <div className=\"{}\" />; }}\n",
            page_header_class()
        ),
    );

    let output = run_guardrails(&root);
    let stderr = String::from_utf8_lossy(&output.stderr);

    fs::remove_dir_all(&root).expect("remove fixture root");

    assert!(!output.status.success(), "guardrail script should fail");
    assert!(
        stderr.contains("shared integration-test helpers")
            || stderr.contains("sf-page-header markup")
    );
}
