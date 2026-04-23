use std::collections::BTreeMap;

use forge::prelude::*;
use forge::validation::file_rules::is_image;
use serde::Serialize;
use serde_json::Value;
use ts_rs::TS;

use crate::domain::models::Page;
use crate::portals::admin::requests::{CreatePageRequest, UpdatePageRequest};
use crate::portals::admin::responses::{AdminPageResponse, PageCoverResponse};
use crate::support::i18n::default_locale;
use crate::support::validation::new_validator;

const PAGE_SLUG_PATTERN: &str = r"^[a-z0-9]+(?:-[a-z0-9]+)*$";
const PAGE_COVER_COLLECTION: &str = "cover";

#[derive(Clone, Debug, Serialize, TS, forge::ApiSchema)]
#[ts(export)]
pub struct AdminPageRow {
    pub id: String,
    pub slug: String,
    pub title: String,
    pub is_system: bool,
    pub updated_at: Option<String>,
}

pub async fn detail(app: &AppContext, i18n: &I18n, id: &str) -> Result<AdminPageResponse> {
    let page = find_page(app, i18n, id).await?;
    present_page(app, &page).await
}

pub async fn create(
    app: &AppContext,
    i18n: &I18n,
    req: &CreatePageRequest,
) -> Result<AdminPageResponse> {
    let default_locale = default_locale(app);
    let slug = normalize_slug(&req.slug);
    let title = sanitize_localized_values(&localized_map(&req.title));
    let content = sanitize_localized_values(&localized_map(&req.content));

    validate_page_input(app, i18n, &slug, &title, &content, None, &default_locale).await?;

    let transaction = app.begin_transaction().await?;
    let now = DateTime::now();
    let page = Page::model_create()
        .set(Page::SLUG, slug.as_str())
        .set(Page::IS_SYSTEM, false)
        .set(Page::UPDATED_AT, Some(now))
        .save(&transaction)
        .await?;

    sync_translations(&transaction, &page, &title, &content).await?;
    transaction.commit().await?;

    present_page(app, &page).await
}

pub async fn update(
    app: &AppContext,
    i18n: &I18n,
    id: &str,
    req: &UpdatePageRequest,
) -> Result<AdminPageResponse> {
    let page = find_page(app, i18n, id).await?;
    let default_locale = default_locale(app);
    let slug = normalize_slug(&req.slug);
    let title = sanitize_localized_values(&localized_map(&req.title));
    let content = sanitize_localized_values(&localized_map(&req.content));

    if page.is_system && slug != page.slug {
        return Err(Error::http(
            422,
            forge::t!(i18n, "admin.pages.errors.system_slug_locked"),
        ));
    }

    validate_page_input(
        app,
        i18n,
        &slug,
        &title,
        &content,
        Some(page.id),
        &default_locale,
    )
    .await?;

    let transaction = app.begin_transaction().await?;
    let updated = page
        .update()
        .set(Page::SLUG, slug.as_str())
        .set(Page::UPDATED_AT, Some(DateTime::now()))
        .save(&transaction)
        .await?;

    sync_translations(&transaction, &updated, &title, &content).await?;
    transaction.commit().await?;

    present_page(app, &updated).await
}

pub async fn delete(app: &AppContext, i18n: &I18n, id: &str) -> Result<()> {
    let page = find_page(app, i18n, id).await?;

    if page.is_system {
        return Err(Error::http(
            403,
            forge::t!(i18n, "admin.pages.errors.system_delete_forbidden"),
        ));
    }

    page.detach_all(app, PAGE_COVER_COLLECTION).await?;

    let transaction = app.begin_transaction().await?;
    delete_all_translations(&transaction, &page).await?;
    page.force_delete().execute(&transaction).await?;
    transaction.commit().await?;

    Ok(())
}

pub async fn upload_cover(
    app: &AppContext,
    i18n: &I18n,
    id: &str,
    file: UploadedFile,
) -> Result<AdminPageResponse> {
    let page = find_page(app, i18n, id).await?;

    if !is_image(&file).await? {
        return Err(Error::http(
            422,
            forge::t!(i18n, "admin.pages.errors.cover_must_be_image"),
        ));
    }

    page.detach_all(app, PAGE_COVER_COLLECTION).await?;
    page.attach(app, PAGE_COVER_COLLECTION, file).await?;

    present_page(app, &page).await
}

pub async fn delete_cover(app: &AppContext, i18n: &I18n, id: &str) -> Result<AdminPageResponse> {
    let page = find_page(app, i18n, id).await?;
    page.detach_all(app, PAGE_COVER_COLLECTION).await?;
    present_page(app, &page).await
}

async fn find_page(app: &AppContext, i18n: &I18n, id: &str) -> Result<Page> {
    let db = app.database()?;
    let page_id: ModelId<Page> = id
        .parse()
        .map_err(|_| Error::not_found(forge::t!(i18n, "error.not_found")))?;

    Page::model_query()
        .where_(Page::ID.eq(page_id))
        .first(&*db)
        .await?
        .ok_or_else(|| Error::not_found(forge::t!(i18n, "error.not_found")))
}

async fn present_page(app: &AppContext, page: &Page) -> Result<AdminPageResponse> {
    let translations = page.all_translations(app).await?;
    let mut title = BTreeMap::new();
    let mut content = BTreeMap::new();

    for translation in translations {
        match translation.field.as_str() {
            "title" => {
                title.insert(translation.locale, translation.value);
            }
            "content" => {
                content.insert(translation.locale, translation.value);
            }
            _ => {}
        }
    }

    let cover = match page.attachment(app, PAGE_COVER_COLLECTION).await? {
        Some(attachment) => {
            let url = attachment
                .url(app)
                .await
                .unwrap_or_else(|_| attachment.path.clone());

            Some(PageCoverResponse {
                id: attachment.id,
                name: attachment.name,
                mime_type: attachment.mime_type,
                size_bytes: attachment.size.max(0) as u64,
                url,
            })
        }
        None => None,
    };

    Ok(AdminPageResponse {
        id: page.id.to_string(),
        slug: page.slug.clone(),
        is_system: page.is_system,
        title: serde_json::to_value(title).map_err(Error::other)?,
        content: serde_json::to_value(content).map_err(Error::other)?,
        cover,
        created_at: page.created_at.to_string(),
        updated_at: page.updated_at.map(|value| value.to_string()),
    })
}

async fn validate_page_input(
    app: &AppContext,
    i18n: &I18n,
    slug: &str,
    title: &BTreeMap<String, String>,
    content: &BTreeMap<String, String>,
    current_id: Option<ModelId<Page>>,
    default_locale: &str,
) -> Result<()> {
    let mut validator = new_validator(app, i18n.locale());
    validator.custom_attribute("slug", forge::t!(i18n, "admin.pages.fields.slug"));
    validator.custom_attribute(
        format!("title.{default_locale}"),
        forge::t!(i18n, "admin.pages.fields.title"),
    );
    validator.custom_attribute(
        format!("content.{default_locale}"),
        forge::t!(i18n, "admin.pages.fields.content"),
    );

    validator
        .field("slug", slug)
        .bail()
        .required()
        .regex(PAGE_SLUG_PATTERN)
        .apply()
        .await?;

    if !title.contains_key(default_locale) {
        validator.add_error(&format!("title.{default_locale}"), "required", &[]);
    }

    if !content.contains_key(default_locale) {
        validator.add_error(&format!("content.{default_locale}"), "required", &[]);
    }

    ensure_slug_available(app, &mut validator, slug, current_id).await?;
    validator.finish()?;
    Ok(())
}

async fn ensure_slug_available(
    app: &AppContext,
    validator: &mut Validator,
    slug: &str,
    current_id: Option<ModelId<Page>>,
) -> Result<()> {
    let db = app.database()?;
    let mut query = Page::model_query().where_(Page::SLUG.eq(slug));

    if let Some(current_id) = current_id {
        query = query.where_(Page::ID.not_eq(current_id));
    }

    if query.first(&*db).await?.is_some() {
        validator.add_error("slug", "unique", &[]);
    }

    Ok(())
}

fn sanitize_localized_values(values: &BTreeMap<String, String>) -> BTreeMap<String, String> {
    values
        .iter()
        .filter_map(|(locale, value)| {
            let trimmed = value.trim();
            (!trimmed.is_empty()).then(|| (locale.clone(), trimmed.to_string()))
        })
        .collect()
}

fn localized_map(value: &Value) -> BTreeMap<String, String> {
    value
        .as_object()
        .map(|entries| {
            entries
                .iter()
                .filter_map(|(locale, entry)| {
                    entry
                        .as_str()
                        .map(|text| (locale.clone(), text.to_string()))
                })
                .collect()
        })
        .unwrap_or_default()
}

fn normalize_slug(value: &str) -> String {
    let mut normalized = String::new();
    let mut last_was_dash = false;

    for ch in value.trim().chars() {
        let mapped = match ch {
            'A'..='Z' => ch.to_ascii_lowercase(),
            'a'..='z' | '0'..='9' => ch,
            ' ' | '_' | '-' => '-',
            _ => ch,
        };

        if mapped == '-' {
            if !normalized.is_empty() && !last_was_dash {
                normalized.push('-');
            }
            last_was_dash = true;
            continue;
        }

        normalized.push(mapped);
        last_was_dash = false;
    }

    normalized.trim_matches('-').to_string()
}

async fn sync_translations<E>(
    executor: &E,
    page: &Page,
    title: &BTreeMap<String, String>,
    content: &BTreeMap<String, String>,
) -> Result<()>
where
    E: QueryExecutor,
{
    delete_all_translations(executor, page).await?;

    for (locale, value) in title {
        upsert_translation(executor, page, locale, "title", value).await?;
    }

    for (locale, value) in content {
        upsert_translation(executor, page, locale, "content", value).await?;
    }

    Ok(())
}

async fn delete_all_translations<E>(executor: &E, page: &Page) -> Result<()>
where
    E: QueryExecutor,
{
    executor
        .raw_execute(
            "DELETE FROM model_translations WHERE translatable_type = $1 AND translatable_id = $2::uuid",
            &[
                DbValue::Text(Page::translatable_type().to_string()),
                DbValue::Text(page.translatable_id()),
            ],
        )
        .await?;

    Ok(())
}

async fn upsert_translation<E>(
    executor: &E,
    page: &Page,
    locale: &str,
    field: &str,
    value: &str,
) -> Result<()>
where
    E: QueryExecutor,
{
    executor
        .raw_execute(
            "INSERT INTO model_translations (id, translatable_type, translatable_id, locale, field, value, created_at) \
             VALUES (gen_random_uuid(), $1, $2::uuid, $3, $4, $5, NOW()) \
             ON CONFLICT (translatable_type, translatable_id, locale, field) \
             DO UPDATE SET value = $5, updated_at = NOW()",
            &[
                DbValue::Text(Page::translatable_type().to_string()),
                DbValue::Text(page.translatable_id()),
                DbValue::Text(locale.to_string()),
                DbValue::Text(field.to_string()),
                DbValue::Text(value.to_string()),
            ],
        )
        .await?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{localized_map, normalize_slug, sanitize_localized_values};
    use serde_json::json;
    use std::collections::BTreeMap;

    #[test]
    fn normalize_slug_lowercases_and_collapses_separators() {
        assert_eq!(normalize_slug(" Privacy_Policy  "), "privacy-policy");
        assert_eq!(
            normalize_slug("terms---and conditions"),
            "terms-and-conditions"
        );
    }

    #[test]
    fn sanitize_localized_values_drops_blank_entries() {
        let values = BTreeMap::from([
            ("en".to_string(), " Privacy Policy ".to_string()),
            ("zh".to_string(), "   ".to_string()),
        ]);

        let sanitized = sanitize_localized_values(&values);

        assert_eq!(
            sanitized.get("en").map(String::as_str),
            Some("Privacy Policy")
        );
        assert!(!sanitized.contains_key("zh"));
    }

    #[test]
    fn localized_map_ignores_non_string_entries() {
        let value = json!({
            "en": "Privacy Policy",
            "zh": 123
        });

        let localized = localized_map(&value);

        assert_eq!(
            localized,
            BTreeMap::from([("en".to_string(), "Privacy Policy".to_string())])
        );
    }
}
