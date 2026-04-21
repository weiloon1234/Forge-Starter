use std::collections::BTreeMap;

use forge::prelude::*;

use crate::domain::badges::BadgeRegistry;
use crate::domain::models::Admin;
use crate::domain::services::admin_service;

/// Compute the current badge counts for `admin`, filtered to badges whose
/// `PERMISSION` is in the admin's effective permission set.
///
/// Returns `{ key: count }` for every permitted badge, including counts of 0.
/// The full snapshot lets the frontend build its allowlist for WS filtering.
pub async fn current_counts(app: &AppContext, admin: &Admin) -> Result<BTreeMap<String, u64>> {
    let registry = app.resolve::<BadgeRegistry>()?;
    let permissions: std::collections::BTreeSet<_> = admin_service::effective_permissions(admin)
        .into_iter()
        .collect();

    let mut out = BTreeMap::new();
    for descriptor in registry.iter_descriptors() {
        if !permissions.contains(&descriptor.permission) {
            continue;
        }
        let count = (descriptor.count)(app.clone()).await?;
        out.insert(descriptor.key.to_string(), count);
    }
    Ok(out)
}
