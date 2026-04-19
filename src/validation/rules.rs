use async_trait::async_trait;
use forge::countries::CountryStatus;
use forge::validation::{RuleContext, ValidationError, ValidationRule};
use forge::Model;

use crate::domain::models::Country;

pub struct MobileRule;

#[async_trait]
impl ValidationRule for MobileRule {
    async fn validate(
        &self,
        _context: &RuleContext,
        value: &str,
    ) -> std::result::Result<(), ValidationError> {
        if value.starts_with('+') && value[1..].chars().all(|c| c.is_ascii_digit()) {
            Ok(())
        } else {
            Err(ValidationError::new("mobile", "Invalid mobile number"))
        }
    }
}

pub struct UsernameRule;

#[async_trait]
impl ValidationRule for UsernameRule {
    async fn validate(
        &self,
        _context: &RuleContext,
        value: &str,
    ) -> std::result::Result<(), ValidationError> {
        if value.chars().count() < 5 {
            return Err(ValidationError::new(
                "username_min",
                "Username must be at least 5 characters",
            ));
        }
        if !value.chars().all(|c| c.is_alphanumeric()) {
            return Err(ValidationError::new(
                "username_alpha_numeric",
                "Username must contain only letters and numbers",
            ));
        }
        Ok(())
    }
}

pub struct PasswordRule;

#[async_trait]
impl ValidationRule for PasswordRule {
    async fn validate(
        &self,
        _context: &RuleContext,
        value: &str,
    ) -> std::result::Result<(), ValidationError> {
        if value.chars().count() < 8 {
            return Err(ValidationError::new(
                "password_min",
                "Password must be at least 8 characters",
            ));
        }
        Ok(())
    }
}

pub struct ActiveCountryRule;

#[async_trait]
impl ValidationRule for ActiveCountryRule {
    async fn validate(
        &self,
        context: &RuleContext,
        value: &str,
    ) -> std::result::Result<(), ValidationError> {
        let iso2 = value.trim().to_ascii_uppercase();
        if iso2.is_empty() {
            return Ok(());
        }

        let db = context
            .app()
            .database()
            .map_err(|_| ValidationError::new("active_country", "Invalid country"))?;

        let country = Country::model_query()
            .where_(Country::ISO2.eq(iso2.as_str()))
            .first(db.as_ref())
            .await
            .map_err(|_| ValidationError::new("active_country", "Invalid country"))?;

        match country {
            Some(country) if country.status == CountryStatus::Enabled => Ok(()),
            _ => Err(ValidationError::new("active_country", "Invalid country")),
        }
    }
}
