use async_trait::async_trait;
use forge::prelude::*;
use crate::domain::models::{User, Admin};
use crate::domain::jobs::SendWelcomeEmail;
use crate::portals::admin::datatables::{CountryDatatable, UserDatatable};

pub struct AppServiceProvider;

#[async_trait]
impl ServiceProvider for AppServiceProvider {
    async fn register(&self, registrar: &mut ServiceRegistrar) -> Result<()> {
        registrar.register_authenticatable::<User>()?;
        registrar.register_authenticatable::<Admin>()?;
        registrar.register_job::<SendWelcomeEmail>()?;
        registrar.register_datatable::<UserDatatable>()?;
        registrar.register_datatable::<CountryDatatable>()?;
        forge::register_generated_database!(registrar)?;
        Ok(())
    }
}
