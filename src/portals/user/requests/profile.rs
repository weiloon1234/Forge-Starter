use async_trait::async_trait;
use forge::prelude::*;
use serde::Deserialize;

use crate::support::validation::{
    validate_optional_active_country, validate_optional_contact_number, validate_optional_email,
    validate_optional_name, validate_optional_username, validate_phone_for_country_pair,
};

#[derive(Debug, Deserialize, ts_rs::TS, forge::ApiSchema)]
#[ts(export)]
pub struct UpdateProfileRequest {
    pub username: Option<String>,
    pub name: Option<String>,
    pub email: Option<String>,
    pub country_iso2: Option<String>,
    pub contact_country_iso2: Option<String>,
    pub contact_number: Option<String>,
}

#[async_trait]
impl RequestValidator for UpdateProfileRequest {
    async fn validate(&self, validator: &mut Validator) -> Result<()> {
        validate_optional_username(validator, "username", self.username.as_deref()).await?;
        validate_optional_name(validator, "name", self.name.as_deref()).await?;
        validate_optional_email(validator, "email", self.email.as_deref()).await?;
        validate_optional_active_country(validator, "country_iso2", self.country_iso2.as_deref())
            .await?;
        validate_optional_active_country(
            validator,
            "contact_country_iso2",
            self.contact_country_iso2.as_deref(),
        )
        .await?;
        validate_optional_contact_number(
            validator,
            "contact_number",
            self.contact_number.as_deref(),
        )
        .await?;
        validate_phone_for_country_pair(
            validator,
            self.contact_country_iso2.as_deref(),
            self.contact_number.as_deref(),
            "contact_number",
        );

        Ok(())
    }
}
