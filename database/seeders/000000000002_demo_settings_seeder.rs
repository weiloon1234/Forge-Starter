use async_trait::async_trait;
use forge::prelude::*;
use forge::settings::SettingType;
use serde_json::{json, Value};

pub struct Entry;

struct DemoSetting<'a> {
    key: &'a str,
    value: Option<Value>,
    setting_type: SettingType,
    parameters: Value,
    group_name: &'a str,
    label: &'a str,
    description: Option<&'a str>,
    sort_order: i32,
    is_public: bool,
}

#[async_trait]
impl SeederFile for Entry {
    async fn run(ctx: &SeederContext<'_>) -> Result<()> {
        let settings = demo_settings();

        for setting in settings.iter() {
            upsert_setting(ctx, setting).await?;
            println!("  seeded setting: {}", setting.key);
        }

        Ok(())
    }
}

fn demo_settings() -> Vec<DemoSetting<'static>> {
    vec![
        DemoSetting {
            key: "demo.settings.text",
            value: Some(json!("Forge Starter")),
            setting_type: SettingType::Text,
            parameters: json!({ "max_length": 120, "placeholder": "Enter title" }),
            group_name: "general",
            label: "Demo Text",
            description: Some("Single-line text input demo"),
            sort_order: 1,
            is_public: true,
        },
        DemoSetting {
            key: "demo.settings.textarea",
            value: Some(json!("This is a longer textarea demo value.")),
            setting_type: SettingType::Textarea,
            parameters: json!({ "max_length": 500, "rows": 5 }),
            group_name: "general",
            label: "Demo Textarea",
            description: Some("Textarea demo"),
            sort_order: 2,
            is_public: false,
        },
        DemoSetting {
            key: "demo.settings.number",
            value: Some(json!(42)),
            setting_type: SettingType::Number,
            parameters: json!({ "min": 0, "max": 100, "step": 5 }),
            group_name: "general",
            label: "Demo Number",
            description: Some("Number input demo"),
            sort_order: 3,
            is_public: false,
        },
        DemoSetting {
            key: "demo.settings.boolean",
            value: Some(json!(true)),
            setting_type: SettingType::Boolean,
            parameters: json!({}),
            group_name: "general",
            label: "Demo Boolean",
            description: Some("Boolean toggle demo"),
            sort_order: 4,
            is_public: true,
        },
        DemoSetting {
            key: "demo.settings.select",
            value: Some(json!("dark")),
            setting_type: SettingType::Select,
            parameters: json!({
                "options": [
                    { "value": "light", "label": "Light" },
                    { "value": "dark", "label": "Dark" },
                    { "value": "system", "label": "System" }
                ]
            }),
            group_name: "appearance",
            label: "Demo Select",
            description: Some("Single select demo"),
            sort_order: 1,
            is_public: true,
        },
        DemoSetting {
            key: "demo.settings.multiselect",
            value: Some(json!(["email", "sms"])),
            setting_type: SettingType::Multiselect,
            parameters: json!({
                "options": [
                    { "value": "email", "label": "Email" },
                    { "value": "sms", "label": "SMS" },
                    { "value": "push", "label": "Push" }
                ]
            }),
            group_name: "notifications",
            label: "Demo Multiselect",
            description: Some("Multi-select demo"),
            sort_order: 1,
            is_public: false,
        },
        DemoSetting {
            key: "demo.settings.email",
            value: Some(json!("hello@example.com")),
            setting_type: SettingType::Email,
            parameters: json!({}),
            group_name: "mail",
            label: "Demo Email",
            description: Some("Email input demo"),
            sort_order: 1,
            is_public: false,
        },
        DemoSetting {
            key: "demo.settings.url",
            value: Some(json!("https://example.com/docs")),
            setting_type: SettingType::Url,
            parameters: json!({}),
            group_name: "general",
            label: "Demo URL",
            description: Some("URL input demo"),
            sort_order: 5,
            is_public: true,
        },
        DemoSetting {
            key: "demo.settings.color",
            value: Some(json!("#0f766e")),
            setting_type: SettingType::Color,
            parameters: json!({}),
            group_name: "appearance",
            label: "Demo Color",
            description: Some("Color picker demo"),
            sort_order: 2,
            is_public: true,
        },
        DemoSetting {
            key: "demo.settings.date",
            value: Some(json!("2026-04-20")),
            setting_type: SettingType::Date,
            parameters: json!({}),
            group_name: "schedule",
            label: "Demo Date",
            description: Some("Date picker demo"),
            sort_order: 1,
            is_public: false,
        },
        DemoSetting {
            key: "demo.settings.datetime",
            value: Some(json!("2026-04-20T10:30:00+08:00")),
            setting_type: SettingType::Datetime,
            parameters: json!({}),
            group_name: "schedule",
            label: "Demo Datetime",
            description: Some("Datetime picker demo"),
            sort_order: 2,
            is_public: false,
        },
        DemoSetting {
            key: "demo.settings.file",
            value: None,
            setting_type: SettingType::File,
            parameters: json!({
                "allowed_mimes": ["application/pdf", "text/plain"],
                "max_size_kb": 2048
            }),
            group_name: "uploads",
            label: "Demo File",
            description: Some("Single file upload demo"),
            sort_order: 1,
            is_public: false,
        },
        DemoSetting {
            key: "demo.settings.image",
            value: None,
            setting_type: SettingType::Image,
            parameters: json!({
                "allowed_mimes": ["image/png", "image/jpeg", "image/webp"],
                "max_size_kb": 2048,
                "max_width": 1024,
                "max_height": 1024
            }),
            group_name: "uploads",
            label: "Demo Image",
            description: Some("Single image upload demo"),
            sort_order: 2,
            is_public: false,
        },
        DemoSetting {
            key: "demo.settings.json",
            value: Some(json!({
                "theme": "dark",
                "features": ["settings", "countries"]
            })),
            setting_type: SettingType::Json,
            parameters: json!({}),
            group_name: "developer",
            label: "Demo JSON",
            description: Some("JSON editor demo"),
            sort_order: 1,
            is_public: false,
        },
        DemoSetting {
            key: "demo.settings.password",
            value: Some(json!("secret123")),
            setting_type: SettingType::Password,
            parameters: json!({}),
            group_name: "security",
            label: "Demo Password",
            description: Some("Password input demo"),
            sort_order: 1,
            is_public: false,
        },
        DemoSetting {
            key: "demo.settings.code",
            value: Some(json!("body {\n  background: #0f172a;\n  color: #f8fafc;\n}")),
            setting_type: SettingType::Code,
            parameters: json!({ "language": "css" }),
            group_name: "developer",
            label: "Demo Code",
            description: Some("Code editor demo"),
            sort_order: 2,
            is_public: false,
        },
    ]
}

async fn upsert_setting(ctx: &SeederContext<'_>, setting: &DemoSetting<'_>) -> Result<()> {
    let value_param = match setting.value.clone() {
        Some(value) => DbValue::Json(value),
        None => DbValue::Null(DbType::Json),
    };
    let description_param = match setting.description {
        Some(value) => DbValue::Text(value.to_string()),
        None => DbValue::Null(DbType::Text),
    };

    ctx.raw_execute(
        r#"INSERT INTO settings
           (key, value, setting_type, parameters, group_name, label, description, sort_order, is_public, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
           ON CONFLICT (key) DO UPDATE
           SET setting_type = EXCLUDED.setting_type,
               parameters = EXCLUDED.parameters,
               group_name = EXCLUDED.group_name,
               label = EXCLUDED.label,
               description = EXCLUDED.description,
               sort_order = EXCLUDED.sort_order,
               is_public = EXCLUDED.is_public,
               updated_at = NOW()"#,
        &[
            DbValue::Text(setting.key.to_string()),
            value_param,
            DbValue::Text(setting.setting_type.as_str().to_string()),
            DbValue::Json(setting.parameters.clone()),
            DbValue::Text(setting.group_name.to_string()),
            DbValue::Text(setting.label.to_string()),
            description_param,
            DbValue::Int32(setting.sort_order),
            DbValue::Bool(setting.is_public),
        ],
    )
    .await?;

    Ok(())
}
