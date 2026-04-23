use async_trait::async_trait;
use forge::prelude::*;
use serde::Deserialize;

use crate::ids;

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
        if let Some(username) = self.username.as_deref() {
            validator
                .field("username", username)
                .bail()
                .nullable()
                .max(50)
                .rule(ids::validation::USERNAME)
                .apply()
                .await?;
        }

        if let Some(name) = self.name.as_deref() {
            validator
                .field("name", name)
                .bail()
                .nullable()
                .min(2)
                .max(100)
                .apply()
                .await?;
        }

        if let Some(email) = self.email.as_deref() {
            validator
                .field("email", email)
                .bail()
                .nullable()
                .email()
                .max(255)
                .apply()
                .await?;
        }

        if let Some(country_iso2) = self.country_iso2.as_deref() {
            validator
                .field("country_iso2", country_iso2)
                .bail()
                .nullable()
                .rule(ids::validation::ACTIVE_COUNTRY)
                .apply()
                .await?;
        }

        if let Some(contact_country_iso2) = self.contact_country_iso2.as_deref() {
            validator
                .field("contact_country_iso2", contact_country_iso2)
                .bail()
                .nullable()
                .rule(ids::validation::ACTIVE_COUNTRY)
                .apply()
                .await?;
        }

        if let Some(contact_number) = self.contact_number.as_deref() {
            validator
                .field("contact_number", contact_number)
                .nullable()
                .apply()
                .await?;
        }

        if !crate::validation::is_phone_valid_for_country(
            self.contact_country_iso2.as_deref(),
            self.contact_number.as_deref(),
        ) {
            validator.add_error("contact_number", "phone_invalid_for_country", &[]);
        }

        Ok(())
    }
}
