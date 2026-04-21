---
name: new-validation-rule
description: Use when adding a custom backend validation rule — a `ValidationRule` trait impl that request DTOs can invoke via `.rule(ids::validation::<RULE>)` to check a field beyond the built-ins (min, max, email, required, etc.). Typical phrasings: "add a validation rule for strong password complexity", "custom rule for alphanumeric-only usernames", "validate that a referral code exists", "rule for mobile number format", "check that a country code is active", "custom field validator that hits the DB". Covers the struct impl of `ValidationRule`, the `ValidationRuleId` constant, the bootstrap registration, the required i18n translation keys, and how request DTOs invoke the rule. Do NOT use for: using built-in rules (`.required()`, `.min(n)`, `.max(n)`, `.email()`, etc. — inline via the validator field chain); frontend-side form validation (→ `useForm` + backend 422 auto-wiring — the rule runs on the server and errors propagate to the frontend automatically); model-level invariants (→ `ModelLifecycle` per `new-model`'s lifecycle reference); policy / permission checks (→ `Permission` enum + route guards).
---

# New Validation Rule — add a custom `ValidationRule` for request DTOs

## When to invoke

A developer needs a validation check that Forge's built-in rules don't cover. Typical phrasings:

- "add a strong-password rule (length + special char + digit)"
- "alphanumeric-only usernames"
- "validate that a referral code exists in the database"
- "mobile number format check"
- "country code must reference an active country"
- "custom asynchronous rule that hits an external service"

Do NOT invoke for:
- **Built-in rules** — `.required()`, `.min(n)`, `.max(n)`, `.email()`, `.numeric()`, etc. are already available on the validator field chain. Use them directly in the request DTO's `RequestValidator` impl.
- **Frontend-only validation** — the frontend doesn't pre-validate. `useForm` auto-wires 422 errors from the backend's validation response. See `frontend-form` + the axios interceptor pattern.
- **Model-level invariants** — "updated_at must be >= created_at" and similar cross-field constraints on a model belong in a `ModelLifecycle<M>` impl. See `new-model`'s `references/lifecycle-hooks.md`.
- **Policy / permission checks** — "only admins with X permission can set this field" is an authorization concern, not validation. Use route-level `.permission(Permission::X)` + service-level `ensure_*` helpers.
- **Business rules that span multiple fields** — "discount cannot exceed order total" belongs in the service layer (or a `ModelLifecycle`), not a validation rule. Validation rules operate on a single field's value.

## Concept

Forge's `ValidationRule` trait:

```rust
#[async_trait]
pub trait ValidationRule: Send + Sync + 'static {
    async fn validate(
        &self,
        context: &RuleContext,
        value: &str,
    ) -> std::result::Result<(), ValidationError>;
}
```

A rule takes a field's stringified value, optionally touches `context.app()` for DB / service access, and returns `Ok(())` on pass or `ValidationError::new(code, message)` on fail. The error `code` is the key for the `validation.{code}` translation lookup — the frontend-rendered message comes from i18n, not from the rule's English string (though the rule must provide a default English message).

Rules are registered once at app bootstrap via `AppBuilder::register_validation_rule(id, rule)`. Every `ValidationRuleId` is declared in `src/ids/validation.rs` (typed ID constant). DTOs invoke the rule via `.rule(ids::validation::<RULE_NAME>)` on the field builder.

The starter already ships four custom rules: `MobileRule`, `UsernameRule`, `PasswordRule`, `ActiveCountryRule` — see `src/validation/rules.rs` for the canonical implementations.

**Async and context-aware**: rules can `.await` inside `validate`, and `context.app()` gives access to the full `AppContext` (database, services, etc.). This makes "validate that a referral code exists" trivial (DB query inside the rule).

## Prerequisites

- [ ] The check genuinely doesn't fit the built-in rules. If `.email()` or `.min(n)` covers it, use those inline — no new rule needed.
- [ ] The rule operates on **one field** at a time. Cross-field checks live elsewhere (service, lifecycle).
- [ ] The error message has an i18n key and translated values for every locale.

## Decisions — quick

### 1. Rule scope

- **Simple syntactic check** — regex, length, character set. Pure function, no `context` needed.
- **Context-aware check** — hits the database or a service (e.g., "referral code exists", "country is active"). Uses `context.app()`.

### 2. Error codes

One rule may return different `ValidationError::new(code, ...)` codes for different failure modes. Example: `UsernameRule` returns `"username_min"` for length failures and `"username_alpha_numeric"` for character-set failures. Each code gets its own translation entry.

### 3. Naming

- **Rule struct**: PascalCase + `Rule` suffix — `MobileRule`, `ReferralCodeExistsRule`.
- **`ValidationRuleId` constant**: `UPPER_SNAKE_CASE`, matching the rule conceptually. Example: `MOBILE`, `REFERRAL_CODE_EXISTS`.
- **`ValidationRuleId::new("...")` key**: snake_case — `"mobile"`, `"referral_code_exists"`.

## Steps

### 1. Implement the rule

Edit `src/validation/rules.rs` (append a new struct + `impl ValidationRule`):

```rust
use async_trait::async_trait;
use forge::validation::{RuleContext, ValidationError, ValidationRule};

pub struct <Your>Rule;

#[async_trait]
impl ValidationRule for <Your>Rule {
    async fn validate(
        &self,
        _context: &RuleContext,          // rename to `context` if used
        value: &str,
    ) -> std::result::Result<(), ValidationError> {
        // Pure / syntactic check:
        if <fails_check>(value) {
            return Err(ValidationError::new(
                "<code>",                 // matches `validation.<code>` i18n key
                "Default English message",
            ));
        }

        // Context-aware (DB / service):
        // let db = context.app().database()
        //     .map_err(|_| ValidationError::new("<code>", "Lookup failed"))?;
        // let found = <Model>::model_query()
        //     .where_eq(<Model>::<FIELD>, value)
        //     .first(db.as_ref())
        //     .await
        //     .map_err(|_| ValidationError::new("<code>", "Lookup failed"))?;
        // if found.is_none() {
        //     return Err(ValidationError::new("<code>", "Not found"));
        // }

        Ok(())
    }
}
```

Reference the starter's existing rules for shape: `MobileRule` (pure regex-ish check), `ActiveCountryRule` (DB-touching async rule).

### 2. Export from `src/validation/mod.rs`

```rust
pub mod rules;
pub use rules::{
    ActiveCountryRule,
    MobileRule,
    PasswordRule,
    UsernameRule,
    <Your>Rule,                          // ← new
};
```

### 3. Add the `ValidationRuleId` constant

Edit `src/ids/validation.rs`:

```rust
use forge::prelude::*;

pub const MOBILE: ValidationRuleId = ValidationRuleId::new("mobile");
pub const USERNAME: ValidationRuleId = ValidationRuleId::new("username");
pub const PASSWORD: ValidationRuleId = ValidationRuleId::new("password");
pub const ACTIVE_COUNTRY: ValidationRuleId = ValidationRuleId::new("active_country");
pub const <YOUR_RULE>: ValidationRuleId = ValidationRuleId::new("<your_rule>");   // ← new
```

### 4. Register at bootstrap

Edit `src/bootstrap/app.rs`. Add one line to the existing `.register_validation_rule(...)` chain:

```rust
pub fn base() -> AppBuilder {
    App::builder()
        .load_env()
        .load_config_dir("config")
        .register_provider(providers::AppServiceProvider)
        .register_provider(providers::EventServiceProvider)
        .register_provider(providers::BadgeServiceProvider)
        .register_validation_rule(
            ids::validation::ACTIVE_COUNTRY,
            validation::ActiveCountryRule,
        )
        .register_validation_rule(ids::validation::MOBILE, validation::MobileRule)
        .register_validation_rule(ids::validation::USERNAME, validation::UsernameRule)
        .register_validation_rule(ids::validation::PASSWORD, validation::PasswordRule)
        .register_validation_rule(ids::validation::<YOUR_RULE>, validation::<Your>Rule)  // ← new
}
```

### 5. Add i18n translations

Edit `locales/en/validation.json` — add the `validation.<code>` entry for every distinct error code the rule can return:

```json
{
  "validation": {
    "<code_1>": "<English message>",
    "<code_2>": "<Another English message for a different failure mode>"
  }
}
```

Mirror in every other locale (`locales/zh/validation.json`, etc.). Per CLAUDE.md Translation Rules: non-English locales must have every key.

Don't confuse this with the `Default English message` passed to `ValidationError::new(...)` — that's a fallback only used if i18n lookup fails. The authoritative user-facing text is the i18n value.

### 6. Use in a request DTO

In any `RequestValidator::validate` impl:

```rust
validator
    .field("<field_name>", &self.<field_name>)
    .bail()
    .required()
    .rule(ids::validation::<YOUR_RULE>)      // ← invoke your rule
    .apply()
    .await?;
```

The rule is applied to the field's stringified value. If it returns `Err(...)`, the request responds 422 with the error code; the frontend's axios interceptor + `useForm` auto-surfaces it under the field.

## Verify

```bash
make check
make lint
```

Integration test (following the `tests/user_baseline.rs` pattern):

```rust
#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires local PostgreSQL and Redis services with the starter config"]
async fn <your_rule>_rejects_invalid_value() -> Result<()> {
    let (_app, addr) = boot_api().await?;

    let (status, body) = send_json(
        addr,
        "POST",
        "/api/v1/<portal>/<endpoint>",
        None,
        Some(json!({ "<field>": "<invalid value>" })),
    )?;

    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    let errors = body["errors"].as_object().unwrap();
    assert!(errors.contains_key("<field>"));
    Ok(())
}
```

Manual smoke:
1. Send a request with an invalid value → 422 with the error code.
2. Send a request with a valid value → 200.
3. Try via the frontend — the error appears under the correct field automatically (no catch / toast in the calling component).

## Don't

- **Don't inline a custom rule where a built-in fits.** If `.email()`, `.min(n)`, `.required()` cover it, use those. Rules are for genuinely custom checks.
- **Don't hard-code English messages in the frontend.** Rules return an error `code`; the frontend renders via `validation.<code>` i18n lookup. Writing English in a React component is a CLAUDE.md violation.
- **Don't cross-field validate in a rule.** Rules take one field's value. For "end date must be after start date", validate at the DTO level (custom logic inside `RequestValidator::validate` after the per-field chain) or in the service.
- **Don't forget registration.** A compiled rule with a `ValidationRuleId` but no `register_validation_rule(...)` call fails at runtime with "unknown rule". The compiler won't catch it.
- **Don't skip i18n for the error codes.** Without `validation.<code>` in every locale, the frontend shows the English fallback — breaks i18n coverage.
- **Don't reuse a `ValidationRuleId`.** Registering two rules under the same ID produces a runtime overwrite; the second wins, first is silently dropped. Each rule gets a unique ID.
- **Don't put business logic in the rule.** Rules check shape / validity. "Block the save if the user exceeded their quota" is a service-layer concern, not validation.
- **Don't call services that mutate state from a rule.** Rules may `.await` but should only read — never write. Read-and-fail is the rule pattern; write happens after validation passes, in the handler or service.

## When this skill doesn't fit

- **Using an existing rule** — no skill; just add `.rule(ids::validation::X)` in the field chain.
- **Built-in validation** (`required`, `min`, `max`, `email`, etc.) — no skill; inline on the validator builder.
- **Cross-field checks** (`end_date >= start_date`) — after the per-field loop inside `RequestValidator::validate`, or in the service.
- **Model-level invariants** — `ModelLifecycle<M>` impl; see `new-model` `references/lifecycle-hooks.md`.
- **Authorization / permissions** — `Permission` enum + route guards + `ensure_*` helpers in services; not validation.
- **Business-rule enforcement** (stock checks, credit limits, quota) — service layer.
