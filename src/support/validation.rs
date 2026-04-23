use forge::prelude::*;

use crate::ids;
use crate::support::i18n::available_locales;
use crate::validation::is_phone_valid_for_country;

pub fn new_validator(app: &AppContext, locale: &str) -> Validator {
    let mut validator = Validator::new(app.clone());
    validator.set_locale(locale.to_string());
    validator
}

pub fn field_error(
    app: &AppContext,
    locale: &str,
    field: &str,
    code: &str,
    params: &[(&str, &str)],
) -> Error {
    let mut validator = new_validator(app, locale);
    validator.add_error(field, code, params);

    validator
        .finish()
        .expect_err("single field error should fail validation")
        .into()
}

pub async fn validate_required_username(
    validator: &mut Validator,
    field: &str,
    value: &str,
) -> Result<()> {
    validator
        .field(field, value)
        .bail()
        .required()
        .min(3)
        .max(50)
        .rule(ids::validation::USERNAME)
        .apply()
        .await
}

pub async fn validate_optional_username(
    validator: &mut Validator,
    field: &str,
    value: Option<&str>,
) -> Result<()> {
    let Some(value) = value else {
        return Ok(());
    };

    validator
        .field(field, value)
        .bail()
        .nullable()
        .max(50)
        .rule(ids::validation::USERNAME)
        .apply()
        .await
}

pub async fn validate_required_email(
    validator: &mut Validator,
    field: &str,
    value: &str,
) -> Result<()> {
    validator
        .field(field, value)
        .bail()
        .required()
        .email()
        .apply()
        .await
}

pub async fn validate_optional_email(
    validator: &mut Validator,
    field: &str,
    value: Option<&str>,
) -> Result<()> {
    let Some(value) = value else {
        return Ok(());
    };

    validator
        .field(field, value)
        .bail()
        .nullable()
        .email()
        .max(255)
        .apply()
        .await
}

pub async fn validate_required_name(
    validator: &mut Validator,
    field: &str,
    value: &str,
) -> Result<()> {
    validator
        .field(field, value)
        .bail()
        .required()
        .min(2)
        .max(100)
        .apply()
        .await
}

pub async fn validate_optional_name(
    validator: &mut Validator,
    field: &str,
    value: Option<&str>,
) -> Result<()> {
    let Some(value) = value else {
        return Ok(());
    };

    validator
        .field(field, value)
        .bail()
        .nullable()
        .min(2)
        .max(100)
        .apply()
        .await
}

pub async fn validate_required_password(
    validator: &mut Validator,
    field: &str,
    value: &str,
) -> Result<()> {
    validator
        .field(field, value)
        .bail()
        .required()
        .rule(ids::validation::PASSWORD)
        .apply()
        .await
}

pub async fn validate_optional_password(
    validator: &mut Validator,
    field: &str,
    value: Option<&str>,
) -> Result<()> {
    let Some(value) = value else {
        return Ok(());
    };

    validator
        .field(field, value)
        .bail()
        .rule(ids::validation::PASSWORD)
        .apply()
        .await
}

pub async fn validate_optional_non_empty_password(
    validator: &mut Validator,
    field: &str,
    value: Option<&str>,
) -> Result<()> {
    let Some(value) = value else {
        return Ok(());
    };

    if value.is_empty() {
        return Ok(());
    }

    validate_optional_password(validator, field, Some(value)).await
}

pub async fn validate_required_locale(
    validator: &mut Validator,
    field: &str,
    value: &str,
) -> Result<()> {
    let locales = available_locales(validator.app());

    validator
        .field(field, value)
        .bail()
        .required()
        .in_list(locales)
        .apply()
        .await
}

pub async fn validate_optional_locale(
    validator: &mut Validator,
    field: &str,
    value: Option<&str>,
) -> Result<()> {
    let Some(value) = value else {
        return Ok(());
    };
    let locales = available_locales(validator.app());

    validator
        .field(field, value)
        .bail()
        .in_list(locales)
        .apply()
        .await
}

pub async fn validate_optional_active_country(
    validator: &mut Validator,
    field: &str,
    value: Option<&str>,
) -> Result<()> {
    let Some(value) = value else {
        return Ok(());
    };

    validator
        .field(field, value)
        .bail()
        .nullable()
        .rule(ids::validation::ACTIVE_COUNTRY)
        .apply()
        .await
}

pub async fn validate_optional_contact_number(
    validator: &mut Validator,
    field: &str,
    value: Option<&str>,
) -> Result<()> {
    let Some(value) = value else {
        return Ok(());
    };

    validator.field(field, value).nullable().apply().await
}

pub async fn validate_required_uuid(
    validator: &mut Validator,
    field: &str,
    value: &str,
) -> Result<()> {
    validator
        .field(field, value)
        .bail()
        .required()
        .uuid()
        .apply()
        .await
}

pub fn validate_phone_for_country_pair(
    validator: &mut Validator,
    country_iso2: Option<&str>,
    phone: Option<&str>,
    phone_field: &str,
) {
    if !is_phone_valid_for_country(country_iso2, phone) {
        validator.add_error(phone_field, "phone_invalid_for_country", &[]);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bootstrap::cli;

    async fn test_app() -> AppContext {
        cli::builder()
            .build_cli_kernel()
            .await
            .expect("test app should boot")
            .app()
            .clone()
    }

    #[tokio::test]
    async fn required_uuid_helper_rejects_invalid_ids() {
        let app = test_app().await;
        let mut validator = new_validator(&app, "en");
        validate_required_uuid(&mut validator, "user_id", "not-a-uuid")
            .await
            .expect("helper should record validation errors without failing early");

        let errors = validator
            .finish()
            .expect_err("invalid UUID should fail validation on finish");

        assert_eq!(errors.errors.len(), 1);
        assert_eq!(errors.errors[0].field, "user_id");
        assert_eq!(errors.errors[0].code, "uuid");
    }

    #[tokio::test]
    async fn phone_country_pair_helper_adds_field_error() {
        let app = test_app().await;
        let mut validator = new_validator(&app, "en");

        validate_phone_for_country_pair(
            &mut validator,
            Some("MY"),
            Some("not-a-phone"),
            "contact_number",
        );

        let errors = validator
            .finish()
            .expect_err("invalid phone-country pair should fail validation");

        assert_eq!(errors.errors.len(), 1);
        assert_eq!(errors.errors[0].field, "contact_number");
        assert_eq!(errors.errors[0].code, "phone_invalid_for_country");
    }
}
