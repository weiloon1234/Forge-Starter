//! Smoke-test badge used for integration-testing the badge infrastructure
//! end-to-end. Only registered when `APP__BADGES__DEV_DUMMY=true` is set.
//!
//! Watches the `admins` table (every Forge project has one) and counts live
//! admin rows — an arbitrary but easy-to-exercise signal for the integration
//! test. Not a production badge.

use std::future::Future;
use std::pin::Pin;

use forge::prelude::*;

use crate::domain::badges::AdminBadge;
use crate::domain::models::Admin;
use crate::ids::permissions::Permission;

pub struct DevDummyBadge;

impl AdminBadge for DevDummyBadge {
    const KEY: &'static str = "work.dev_dummy";
    const PERMISSION: Permission = Permission::AdminsRead;
    type Watches = Admin;

    fn count(ctx: &AppContext) -> Pin<Box<dyn Future<Output = Result<u64>> + Send + '_>> {
        Box::pin(async move {
            let db = ctx.database()?;
            let n = Admin::model_query().count(&*db).await?;
            Ok(n)
        })
    }
}
