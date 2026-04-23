use std::collections::BTreeMap;

use forge::prelude::*;
use serde_json::Value;

use crate::domain::enums::{CreditAdjustmentOperation, CreditTransactionType, CreditType};
use crate::domain::models::{
    Admin, AdminCreditAdjustment, CreditRelatedKey, CreditTransaction, User,
};
use crate::domain::services::user_service;
use crate::portals::admin::requests::CreateAdminCreditAdjustmentRequest;
use crate::portals::admin::responses::AdminCreditAdjustmentResponse;

const CREDIT_SCALE: u32 = 8;
const CREDIT_INTEGER_DIGITS: usize = 12;
const DEFAULT_RELATED_TYPE: &str = "admin_credit_adjustment";

pub async fn admin_adjust(
    app: &AppContext,
    i18n: &I18n,
    admin: &Admin,
    req: &CreateAdminCreditAdjustmentRequest,
) -> Result<AdminCreditAdjustmentResponse> {
    let user_id = parse_user_id(i18n, &req.user_id)?;
    let amount = FixedCreditAmount::parse_positive(&req.amount)
        .map_err(|_| Error::http(422, forge::t!(i18n, "admin.credits.errors.invalid_amount")))?;
    let explanation_overrides =
        normalized_string_map(&req.explanation_overrides).map_err(|_| {
            Error::http(
                422,
                forge::t!(i18n, "admin.credits.errors.invalid_overrides"),
            )
        })?;
    let context = normalized_object(&req.context)
        .map_err(|_| Error::http(422, forge::t!(i18n, "admin.credits.errors.invalid_context")))?;
    let related_key = normalized_related_key(req.related_key.as_deref()).map_err(|_| {
        Error::http(
            422,
            forge::t!(i18n, "admin.credits.errors.invalid_related_key"),
        )
    })?;
    let related_type = trimmed_option(req.related_type.as_deref());
    let remark = trimmed_option(req.remark.as_deref());
    let signed_delta = amount.apply(req.operation);
    let transaction_type = match req.operation {
        CreditAdjustmentOperation::Add => CreditTransactionType::AdminAdd,
        CreditAdjustmentOperation::Deduct => CreditTransactionType::AdminDeduct,
    };
    let explanation_key = transaction_type.default_explanation_key().to_string();

    let transaction = app.begin_transaction().await?;
    let user = User::model_query()
        .where_(User::ID.eq(user_id))
        .for_update()
        .first(&transaction)
        .await?
        .ok_or_else(|| Error::not_found(forge::t!(i18n, "error.user_not_found")))?;

    let balance_before =
        FixedCreditAmount::parse_any(credit_balance(&user, req.credit_type).as_str())
            .map_err(Error::other)?;
    let balance_after = balance_before.checked_add(signed_delta).map_err(|_| {
        Error::http(
            422,
            forge::t!(i18n, "admin.credits.errors.balance_overflow"),
        )
    })?;
    let balance_after_numeric = balance_after.to_numeric().map_err(Error::other)?;

    let updated_user = user
        .update()
        .set(
            credit_balance_column(req.credit_type),
            balance_after_numeric.clone(),
        )
        .set(User::UPDATED_AT, DateTime::now())
        .save(&transaction)
        .await?;

    let persisted_related_key = related_key.unwrap_or_else(ModelId::<CreditRelatedKey>::generate);
    let persisted_related_type = related_type
        .clone()
        .or_else(|| Some(DEFAULT_RELATED_TYPE.to_string()));
    let explanation_overrides_value =
        serde_json::to_value(&explanation_overrides).map_err(Error::other)?;

    let credit_transaction = CreditTransaction::model_create()
        .set(CreditTransaction::USER_ID, user.id)
        .set(CreditTransaction::CREDIT_TYPE, req.credit_type)
        .set(CreditTransaction::TRANSACTION_TYPE, transaction_type)
        .set(
            CreditTransaction::AMOUNT,
            signed_delta.to_numeric().map_err(Error::other)?,
        )
        .set(
            CreditTransaction::BALANCE_BEFORE,
            balance_before.to_numeric().map_err(Error::other)?,
        )
        .set(
            CreditTransaction::BALANCE_AFTER,
            balance_after_numeric.clone(),
        )
        .set(CreditTransaction::EXPLANATION_KEY, explanation_key.as_str())
        .set(
            CreditTransaction::EXPLANATION_PARAMS,
            Value::Object(Default::default()),
        )
        .set(
            CreditTransaction::EXPLANATION_OVERRIDES,
            explanation_overrides_value.clone(),
        )
        .set(CreditTransaction::RELATED_KEY, Some(persisted_related_key))
        .set(
            CreditTransaction::RELATED_TYPE,
            persisted_related_type.clone(),
        )
        .set(CreditTransaction::CONTEXT, context.clone())
        .save(&transaction)
        .await?;

    let adjustment = AdminCreditAdjustment::model_create()
        .set(
            AdminCreditAdjustment::CREDIT_TRANSACTION_ID,
            credit_transaction.id,
        )
        .set(AdminCreditAdjustment::ADMIN_ID, admin.id)
        .set(AdminCreditAdjustment::REMARK, remark.clone())
        .save(&transaction)
        .await?;

    transaction.commit().await?;

    Ok(AdminCreditAdjustmentResponse {
        id: adjustment.id.to_string(),
        credit_transaction_id: credit_transaction.id.to_string(),
        user_id: updated_user.id.to_string(),
        user_label: user_service::user_label(&updated_user),
        credit_type: req.credit_type,
        transaction_type,
        amount: signed_delta.to_string(),
        balance_before: balance_before.to_string(),
        balance_after: balance_after.to_string(),
        explanation_key: explanation_key.clone(),
        explanation_params: Value::Object(Default::default()),
        explanation_overrides: explanation_overrides_value,
        explanation_text: render_explanation(
            app,
            i18n.locale(),
            &explanation_key,
            &Value::Object(Default::default()),
            &serde_json::to_value(&explanation_overrides).map_err(Error::other)?,
        ),
        related_key: Some(persisted_related_key.to_string()),
        related_type: persisted_related_type,
        context,
        admin_id: admin.id.to_string(),
        admin_label: admin_label(admin),
        remark,
        created_at: adjustment.created_at.to_string(),
        updated_at: adjustment.updated_at.map(|value| value.to_string()),
    })
}

pub fn render_explanation(
    app: &AppContext,
    locale: &str,
    explanation_key: &str,
    explanation_params: &Value,
    explanation_overrides: &Value,
) -> String {
    if let Some(override_value) = explanation_override(explanation_overrides, locale) {
        return override_value.to_string();
    }

    let Ok(i18n) = app.i18n() else {
        return explanation_key.to_string();
    };

    let owned_params = translation_params(explanation_params);
    let borrowed = owned_params
        .iter()
        .map(|(key, value)| (key.as_str(), value.as_str()))
        .collect::<Vec<_>>();

    i18n.translate(locale, explanation_key, &borrowed)
}

pub fn admin_label(admin: &Admin) -> String {
    trimmed_option(Some(admin.name.as_str()))
        .or_else(|| trimmed_option(Some(admin.username.as_str())))
        .or_else(|| trimmed_option(Some(admin.email.as_str())))
        .unwrap_or_else(|| admin.id.to_string())
}

fn parse_user_id(i18n: &I18n, user_id: &str) -> Result<ModelId<User>> {
    user_id
        .parse()
        .map_err(|_| Error::http(422, forge::t!(i18n, "admin.credits.errors.invalid_user")))
}

fn credit_balance(user: &User, _credit_type: CreditType) -> &Numeric {
    &user.credit_1
}

pub fn credit_balance_column(_credit_type: CreditType) -> Column<User, Numeric> {
    User::CREDIT_1
}

fn normalized_string_map(value: &Option<Value>) -> Result<BTreeMap<String, String>> {
    let Some(value) = value else {
        return Ok(BTreeMap::new());
    };

    let object = value
        .as_object()
        .ok_or_else(|| Error::message("expected object"))?;
    let mut output = BTreeMap::new();

    for (locale, text) in object {
        let Some(text) = text.as_str() else {
            return Err(Error::message("expected string override value"));
        };
        let trimmed = text.trim();
        if !trimmed.is_empty() {
            output.insert(locale.clone(), trimmed.to_string());
        }
    }

    Ok(output)
}

fn normalized_object(value: &Option<Value>) -> Result<Value> {
    match value {
        None | Some(Value::Null) => Ok(Value::Object(Default::default())),
        Some(Value::Object(_)) => Ok(value.clone().unwrap_or(Value::Object(Default::default()))),
        Some(_) => Err(Error::message("expected object")),
    }
}

fn normalized_related_key(value: Option<&str>) -> Result<Option<ModelId<CreditRelatedKey>>> {
    let Some(value) = trimmed_option(value) else {
        return Ok(None);
    };

    let parsed = ModelId::<CreditRelatedKey>::parse_str(&value).map_err(Error::other)?;
    Ok(Some(parsed))
}

fn explanation_override<'a>(overrides: &'a Value, locale: &str) -> Option<&'a str> {
    overrides
        .as_object()
        .and_then(|values| values.get(locale))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

fn translation_params(value: &Value) -> Vec<(String, String)> {
    value
        .as_object()
        .map(|items| {
            items
                .iter()
                .map(|(key, value)| (key.clone(), translation_value(value)))
                .collect()
        })
        .unwrap_or_default()
}

fn translation_value(value: &Value) -> String {
    match value {
        Value::Null => String::new(),
        Value::String(value) => value.clone(),
        Value::Bool(value) => value.to_string(),
        Value::Number(value) => value.to_string(),
        Value::Array(_) | Value::Object(_) => value.to_string(),
    }
}

fn trimmed_option(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct FixedCreditAmount {
    scaled: i128,
}

impl FixedCreditAmount {
    const SCALE_FACTOR: i128 = 100_000_000;

    fn parse_positive(value: &str) -> Result<Self> {
        let parsed = Self::parse_any(value)?;
        if parsed.scaled <= 0 {
            return Err(Error::message("amount must be positive"));
        }
        Ok(parsed)
    }

    fn parse_any(value: &str) -> Result<Self> {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            return Err(Error::message("amount cannot be empty"));
        }

        let (sign, unsigned) = match trimmed.as_bytes()[0] {
            b'+' => (1_i128, &trimmed[1..]),
            b'-' => (-1_i128, &trimmed[1..]),
            _ => (1_i128, trimmed),
        };

        let mut parts = unsigned.split('.');
        let integer_part = parts.next().unwrap_or_default();
        let fraction_part = parts.next().unwrap_or_default();

        if parts.next().is_some() {
            return Err(Error::message("amount has too many decimal points"));
        }

        if integer_part.is_empty() && fraction_part.is_empty() {
            return Err(Error::message("amount must contain digits"));
        }

        if !integer_part.is_empty() && !integer_part.chars().all(|char| char.is_ascii_digit()) {
            return Err(Error::message("amount integer part must be digits"));
        }

        if !fraction_part.is_empty() && !fraction_part.chars().all(|char| char.is_ascii_digit()) {
            return Err(Error::message("amount fractional part must be digits"));
        }

        if fraction_part.len() > CREDIT_SCALE as usize {
            return Err(Error::message("amount supports up to 8 decimal places"));
        }

        let integer_digits = integer_part.trim_start_matches('0');
        if integer_digits.len() > CREDIT_INTEGER_DIGITS {
            return Err(Error::message("amount exceeds maximum precision"));
        }

        let integer_value = if integer_part.is_empty() {
            0_i128
        } else {
            integer_part.parse::<i128>().map_err(Error::other)?
        };

        let fraction = if fraction_part.is_empty() {
            0_i128
        } else {
            let padded = format!("{fraction_part:0<8}");
            padded.parse::<i128>().map_err(Error::other)?
        };

        let scaled = sign * (integer_value * Self::SCALE_FACTOR + fraction);
        let amount = Self { scaled };
        amount.ensure_precision()?;
        Ok(amount)
    }

    fn checked_add(self, other: Self) -> Result<Self> {
        let scaled = self
            .scaled
            .checked_add(other.scaled)
            .ok_or_else(|| Error::message("amount overflow"))?;
        let value = Self { scaled };
        value.ensure_precision()?;
        Ok(value)
    }

    fn apply(self, operation: CreditAdjustmentOperation) -> Self {
        match operation {
            CreditAdjustmentOperation::Add => self,
            CreditAdjustmentOperation::Deduct => Self {
                scaled: -self.scaled,
            },
        }
    }

    fn to_numeric(self) -> Result<Numeric> {
        Numeric::new(self.to_string())
    }

    fn ensure_precision(self) -> Result<()> {
        let integer = (self.scaled.abs() / Self::SCALE_FACTOR).to_string();
        if integer.len() > CREDIT_INTEGER_DIGITS {
            return Err(Error::message("amount exceeds numeric(20,8) precision"));
        }
        Ok(())
    }
}

impl std::fmt::Display for FixedCreditAmount {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        if self.scaled == 0 {
            return formatter.write_str("0");
        }

        let sign = if self.scaled < 0 { "-" } else { "" };
        let abs = self.scaled.abs();
        let integer = abs / Self::SCALE_FACTOR;
        let fraction = abs % Self::SCALE_FACTOR;

        if fraction == 0 {
            return write!(formatter, "{sign}{integer}");
        }

        let mut fraction_text = format!("{fraction:08}");
        while fraction_text.ends_with('0') {
            fraction_text.pop();
        }

        write!(formatter, "{sign}{integer}.{fraction_text}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn fixed_credit_amount_parses_and_formats_signed_values() {
        let value = FixedCreditAmount::parse_any("-123.45000001").unwrap();
        assert_eq!(value.scaled, -12_345_000_001);
        assert_eq!(value.to_string(), "-123.45000001");
    }

    #[test]
    fn fixed_credit_amount_trims_trailing_zeroes() {
        let value = FixedCreditAmount::parse_any("42.50000000").unwrap();
        assert_eq!(value.to_string(), "42.5");
    }

    #[test]
    fn normalized_string_map_drops_blank_overrides() {
        let value = Some(json!({
            "en": " Bonus May 2026 ",
            "zh": "   "
        }));

        assert_eq!(
            normalized_string_map(&value).unwrap(),
            BTreeMap::from([("en".to_string(), "Bonus May 2026".to_string())])
        );
    }
}
