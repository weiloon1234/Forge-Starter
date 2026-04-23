use crate::domain::models::AppSetting;
use crate::domain::services::runtime_bootstrap_service;
use crate::portals::admin::responses::{AdminSettingAssetResponse, AdminSettingResponse};
use forge::prelude::*;
use forge::settings::{Setting, SettingType};
use forge::validation::file_rules::{
    check_allowed_mimes, check_max_size, get_image_dimensions, is_image,
};
use serde_json::{Number, Value};

struct LoadedSetting {
    record: AppSetting,
    setting: Setting,
}

pub async fn detail(app: &AppContext, i18n: &I18n, key: &str) -> Result<AdminSettingResponse> {
    let loaded = load_setting(app, i18n, key).await?;
    present_setting(app, loaded).await
}

pub async fn update_value(
    app: &AppContext,
    i18n: &I18n,
    key: &str,
    value: Option<Value>,
) -> Result<AdminSettingResponse> {
    let loaded = load_setting(app, i18n, key).await?;
    let previous_asset = asset_from_value(loaded.setting.value.as_ref());
    let next_value = validate_value(app, i18n, &loaded.setting, value).await?;

    Setting::set(app, key, next_value.clone()).await?;

    if next_value.is_null() {
        delete_asset_if_present(app, previous_asset.as_ref()).await;
    }

    if loaded.setting.is_public {
        let _ = runtime_bootstrap_service::refresh(app).await;
    }

    detail(app, i18n, key).await
}

pub async fn upload_value(
    app: &AppContext,
    i18n: &I18n,
    key: &str,
    file: &UploadedFile,
) -> Result<AdminSettingResponse> {
    let loaded = load_setting(app, i18n, key).await?;

    if !is_upload_setting(&loaded.setting.setting_type) {
        return Err(Error::http(
            422,
            forge::t!(i18n, "admin.settings.errors.upload_not_allowed"),
        ));
    }

    let image_dimensions = validate_upload(app, i18n, &loaded.setting, file).await?;
    let previous_asset = asset_from_value(loaded.setting.value.as_ref());
    let stored = file.store(app, &storage_directory(key)).await?;

    let next_asset = AdminSettingAssetResponse {
        disk: stored.disk,
        path: stored.path,
        name: stored.name,
        mime: stored.content_type.or_else(|| file.content_type.clone()),
        size_bytes: stored.size,
        width: image_dimensions.map(|(width, _)| width),
        height: image_dimensions.map(|(_, height)| height),
        preview_url: None,
        download_url: None,
    };
    let next_value = serde_json::to_value(&next_asset).map_err(Error::other)?;

    if let Err(error) = Setting::set(app, key, next_value).await {
        delete_asset_if_present(
            app,
            Some(&AdminSettingAssetResponse {
                preview_url: None,
                download_url: None,
                ..next_asset.clone()
            }),
        )
        .await;
        return Err(error);
    }

    delete_asset_if_present(app, previous_asset.as_ref()).await;

    if loaded.setting.is_public {
        let _ = runtime_bootstrap_service::refresh(app).await;
    }

    detail(app, i18n, key).await
}

async fn load_setting(app: &AppContext, i18n: &I18n, key: &str) -> Result<LoadedSetting> {
    let db = app.database()?;
    let record = AppSetting::model_query()
        .where_(AppSetting::KEY.eq(key))
        .first(&*db)
        .await?
        .ok_or_else(|| Error::not_found(forge::t!(i18n, "error.not_found")))?;
    let setting = Setting::find(app, key)
        .await?
        .ok_or_else(|| Error::not_found(forge::t!(i18n, "error.not_found")))?;

    Ok(LoadedSetting { record, setting })
}

async fn present_setting(app: &AppContext, loaded: LoadedSetting) -> Result<AdminSettingResponse> {
    let mut asset = asset_from_value(loaded.record.value.as_ref());

    if let Some(current_asset) = asset.as_mut() {
        enrich_asset_urls(app, current_asset).await;
    }

    Ok(AdminSettingResponse {
        key: loaded.record.key,
        label: loaded.record.label,
        description: loaded.record.description,
        group_name: loaded.record.group_name,
        setting_type: loaded.record.setting_type,
        parameters: loaded.record.parameters,
        is_public: loaded.record.is_public,
        value: loaded.record.value.unwrap_or(Value::Null),
        updated_at: loaded.record.updated_at.map(|value| value.to_string()),
        asset,
    })
}

async fn validate_value(
    app: &AppContext,
    i18n: &I18n,
    setting: &Setting,
    value: Option<Value>,
) -> Result<Value> {
    let value = value.unwrap_or(Value::Null);

    if value.is_null() {
        return Ok(Value::Null);
    }

    match setting.setting_type {
        SettingType::Text
        | SettingType::Textarea
        | SettingType::Email
        | SettingType::Url
        | SettingType::Password
        | SettingType::Code
        | SettingType::Color => {
            let text = value
                .as_str()
                .ok_or_else(|| field_error(app, i18n, "setting_string", &[]))?;
            validate_string_value(app, i18n, text, &setting.parameters).await?;

            match setting.setting_type {
                SettingType::Email => validate_email_value(app, i18n, text).await?,
                SettingType::Url => validate_url_value(app, i18n, text).await?,
                SettingType::Color => validate_color_value(app, i18n, text).await?,
                _ => {}
            }

            Ok(Value::String(text.to_string()))
        }
        SettingType::Number => normalize_number_value(app, i18n, &value, &setting.parameters).await,
        SettingType::Boolean => value
            .as_bool()
            .map(Value::Bool)
            .ok_or_else(|| field_error(app, i18n, "setting_boolean", &[])),
        SettingType::Select => {
            let text = value
                .as_str()
                .ok_or_else(|| field_error(app, i18n, "setting_string", &[]))?;
            validate_select_value(app, i18n, text, &setting.parameters).await?;
            Ok(Value::String(text.to_string()))
        }
        SettingType::Multiselect => {
            let items = value
                .as_array()
                .ok_or_else(|| field_error(app, i18n, "setting_multiselect", &[]))?;
            let strings = items
                .iter()
                .map(|item| item.as_str().map(str::to_string))
                .collect::<Option<Vec<_>>>()
                .ok_or_else(|| field_error(app, i18n, "setting_multiselect", &[]))?;
            validate_multiselect_value(app, i18n, &strings, &setting.parameters).await?;
            Ok(Value::Array(
                strings.into_iter().map(Value::String).collect(),
            ))
        }
        SettingType::Date => {
            let text = value
                .as_str()
                .ok_or_else(|| field_error(app, i18n, "setting_string", &[]))?;
            validate_date_value(app, i18n, text).await?;
            Ok(Value::String(text.to_string()))
        }
        SettingType::Datetime => {
            let text = value
                .as_str()
                .ok_or_else(|| field_error(app, i18n, "setting_string", &[]))?;
            validate_datetime_value(app, i18n, text).await?;
            Ok(Value::String(text.to_string()))
        }
        SettingType::Json => Ok(value),
        SettingType::File | SettingType::Image => {
            Err(field_error(app, i18n, "setting_upload_write", &[]))
        }
    }
}

async fn validate_string_value(
    app: &AppContext,
    i18n: &I18n,
    value: &str,
    parameters: &Value,
) -> Result<()> {
    let mut validator = value_validator(app, i18n);
    let mut field = validator.field("value", value);

    if let Some(max_length) = parameter_usize(parameters, "max_length") {
        field = field.max(max_length);
    }

    field.apply().await?;
    validator.finish()?;
    Ok(())
}

async fn validate_color_value(app: &AppContext, i18n: &I18n, value: &str) -> Result<()> {
    let mut validator = value_validator(app, i18n);
    validator
        .field("value", value)
        .regex(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")
        .apply()
        .await?;
    validator.finish()?;
    Ok(())
}

async fn validate_email_value(app: &AppContext, i18n: &I18n, value: &str) -> Result<()> {
    let mut validator = value_validator(app, i18n);
    validator.field("value", value).email().apply().await?;
    validator.finish()?;
    Ok(())
}

async fn validate_url_value(app: &AppContext, i18n: &I18n, value: &str) -> Result<()> {
    let mut validator = value_validator(app, i18n);
    validator.field("value", value).url().apply().await?;
    validator.finish()?;
    Ok(())
}

async fn validate_date_value(app: &AppContext, i18n: &I18n, value: &str) -> Result<()> {
    let mut validator = value_validator(app, i18n);
    validator.field("value", value).date().apply().await?;
    validator.finish()?;
    Ok(())
}

async fn validate_datetime_value(app: &AppContext, i18n: &I18n, value: &str) -> Result<()> {
    let mut validator = value_validator(app, i18n);
    validator.field("value", value).datetime().apply().await?;
    validator.finish()?;
    Ok(())
}

async fn normalize_number_value(
    app: &AppContext,
    i18n: &I18n,
    value: &Value,
    parameters: &Value,
) -> Result<Value> {
    let numeric = match value {
        Value::Number(number) => number
            .as_f64()
            .ok_or_else(|| field_error(app, i18n, "numeric", &[]))?,
        Value::String(text) => text
            .parse::<f64>()
            .map_err(|_| field_error(app, i18n, "numeric", &[]))?,
        _ => return Err(field_error(app, i18n, "numeric", &[])),
    };

    if !numeric.is_finite() {
        return Err(field_error(app, i18n, "numeric", &[]));
    }

    let numeric_text = numeric.to_string();
    let mut validator = value_validator(app, i18n);
    let mut field = validator.field("value", &numeric_text).numeric();

    if let Some(minimum) = parameter_f64(parameters, "min") {
        field = field.min_numeric(minimum);
    }

    if let Some(maximum) = parameter_f64(parameters, "max") {
        field = field.max_numeric(maximum);
    }

    field.apply().await?;

    if let Some(step) = parameter_f64(parameters, "step") {
        let base = parameter_f64(parameters, "min").unwrap_or(0.0);
        let ratio = (numeric - base) / step;
        if (ratio - ratio.round()).abs() > 1e-9 {
            validator.add_error("value", "setting_step", &[]);
        }
    }

    validator.finish()?;

    let number = Number::from_f64(numeric).ok_or_else(|| field_error(app, i18n, "numeric", &[]))?;
    Ok(Value::Number(number))
}

async fn validate_select_value(
    app: &AppContext,
    i18n: &I18n,
    value: &str,
    parameters: &Value,
) -> Result<()> {
    let mut validator = value_validator(app, i18n);
    validator
        .field("value", value)
        .in_list(parameter_option_values(parameters))
        .apply()
        .await?;
    validator.finish()?;
    Ok(())
}

async fn validate_multiselect_value(
    app: &AppContext,
    i18n: &I18n,
    values: &[String],
    parameters: &Value,
) -> Result<()> {
    let mut validator = value_validator(app, i18n);
    validator
        .each("value", values)
        .in_list(parameter_option_values(parameters))
        .apply()
        .await?;
    validator.finish()?;
    Ok(())
}

async fn validate_upload(
    app: &AppContext,
    i18n: &I18n,
    setting: &Setting,
    file: &UploadedFile,
) -> Result<Option<(u32, u32)>> {
    let mut validator = value_validator(app, i18n);

    if let Some(max_size_kb) = parameter_u64(&setting.parameters, "max_size_kb") {
        if !check_max_size(file, max_size_kb) {
            let max = max_size_kb.to_string();
            validator.add_error("value", "max_file_size", &[("max", max.as_str())]);
        }
    }

    let allowed_mimes = parameter_string_list(&setting.parameters, "allowed_mimes");
    if !allowed_mimes.is_empty() && !check_allowed_mimes(file, &allowed_mimes).await? {
        validator.add_error("value", "allowed_mimes", &[]);
    }

    let mut dimensions = None;
    if matches!(setting.setting_type, SettingType::Image) {
        if !is_image(file).await? {
            validator.add_error("value", "image", &[]);
        } else {
            let (width, height) = get_image_dimensions(file).await?;
            dimensions = Some((width, height));

            let max_width = parameter_u64(&setting.parameters, "max_width");
            let max_height = parameter_u64(&setting.parameters, "max_height");
            let exceeds_width = max_width.is_some_and(|value| width as u64 > value);
            let exceeds_height = max_height.is_some_and(|value| height as u64 > value);

            if exceeds_width || exceeds_height {
                let width_text = max_width.unwrap_or(width as u64).to_string();
                let height_text = max_height.unwrap_or(height as u64).to_string();
                validator.add_error(
                    "value",
                    "max_dimensions",
                    &[
                        ("width", width_text.as_str()),
                        ("height", height_text.as_str()),
                    ],
                );
            }
        }
    }

    validator.finish()?;
    Ok(dimensions)
}

fn value_validator(app: &AppContext, i18n: &I18n) -> Validator {
    let mut validator = Validator::new(app.clone());
    validator.set_locale(i18n.locale().to_string());
    validator
}

fn field_error(app: &AppContext, i18n: &I18n, code: &str, params: &[(&str, &str)]) -> Error {
    let mut validator = value_validator(app, i18n);
    validator.add_error("value", code, params);
    validator
        .finish()
        .expect_err("single field error should fail validation")
        .into()
}

fn is_upload_setting(setting_type: &SettingType) -> bool {
    matches!(setting_type, SettingType::File | SettingType::Image)
}

fn asset_from_value(value: Option<&Value>) -> Option<AdminSettingAssetResponse> {
    let value = value?.clone();
    serde_json::from_value::<AdminSettingAssetResponse>(value).ok()
}

async fn enrich_asset_urls(app: &AppContext, asset: &mut AdminSettingAssetResponse) {
    let Ok(storage) = app.storage() else {
        return;
    };
    let Ok(disk) = storage.disk(&asset.disk) else {
        return;
    };

    let expires_at = DateTime::now().add_seconds(3600);
    let resolved_url = match disk.temporary_url(&asset.path, expires_at).await {
        Ok(url) => Some(url),
        Err(_) => disk.url(&asset.path).await.ok(),
    };

    asset.download_url = resolved_url.clone();
    if asset
        .mime
        .as_deref()
        .is_some_and(|mime| mime.starts_with("image/"))
    {
        asset.preview_url = resolved_url;
    }
}

async fn delete_asset_if_present(app: &AppContext, asset: Option<&AdminSettingAssetResponse>) {
    let Some(asset) = asset else {
        return;
    };
    let Ok(storage) = app.storage() else {
        return;
    };
    let Ok(disk) = storage.disk(&asset.disk) else {
        return;
    };
    let _ = disk.delete(&asset.path).await;
}

fn storage_directory(key: &str) -> String {
    let normalized = key
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '-'
            }
        })
        .collect::<String>();
    format!("settings/{normalized}")
}

fn parameter_usize(parameters: &Value, key: &str) -> Option<usize> {
    parameters.get(key)?.as_u64()?.try_into().ok()
}

fn parameter_u64(parameters: &Value, key: &str) -> Option<u64> {
    parameters.get(key)?.as_u64()
}

fn parameter_f64(parameters: &Value, key: &str) -> Option<f64> {
    parameters.get(key)?.as_f64()
}

fn parameter_string_list(parameters: &Value, key: &str) -> Vec<String> {
    parameters
        .get(key)
        .and_then(Value::as_array)
        .map(|values| {
            values
                .iter()
                .filter_map(|value| value.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default()
}

fn parameter_option_values(parameters: &Value) -> Vec<String> {
    parameters
        .get("options")
        .and_then(Value::as_array)
        .map(|options| {
            options
                .iter()
                .filter_map(|option| {
                    option
                        .get("value")
                        .and_then(Value::as_str)
                        .map(str::to_string)
                })
                .collect()
        })
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn asset_from_value_accepts_expected_metadata_shape() {
        let asset = asset_from_value(Some(&json!({
            "disk": "r2",
            "path": "settings/demo/file.pdf",
            "name": "file.pdf",
            "mime": "application/pdf",
            "size_bytes": 2048
        })))
        .expect("asset should parse");

        assert_eq!(asset.disk, "r2");
        assert_eq!(asset.path, "settings/demo/file.pdf");
        assert_eq!(asset.name, "file.pdf");
        assert_eq!(asset.mime.as_deref(), Some("application/pdf"));
        assert_eq!(asset.size_bytes, 2048);
    }

    #[test]
    fn parameter_option_values_ignores_invalid_rows() {
        let options = parameter_option_values(&json!({
            "options": [
                { "value": "light", "label": "Light" },
                { "label": "Missing value" },
                { "value": "dark", "label": "Dark" }
            ]
        }));

        assert_eq!(options, vec!["light".to_string(), "dark".to_string()]);
    }

    #[test]
    fn storage_directory_normalizes_unsafe_key_characters() {
        assert_eq!(
            storage_directory("demo.settings/logo@main"),
            "settings/demo-settings-logo-main"
        );
    }
}
