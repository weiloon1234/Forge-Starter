use async_trait::async_trait;
use forge::validation::{RuleContext, ValidationError, ValidationRule};

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
