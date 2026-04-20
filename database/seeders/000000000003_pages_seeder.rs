use std::path::Path;

use async_trait::async_trait;
use forge::prelude::*;

use crate::domain::models::Page;

const PAGE_COVER_COLLECTION: &str = "cover";

pub struct Entry;

struct SeededPage<'a> {
    slug: &'a str,
    cover_asset: &'a str,
    title_en: &'a str,
    title_zh: &'a str,
    content_en: &'a str,
    content_zh: &'a str,
}

#[async_trait]
impl SeederFile for Entry {
    fn run_in_transaction() -> bool {
        false
    }

    async fn run(ctx: &SeederContext<'_>) -> Result<()> {
        for page in seeded_pages() {
            seed_page(ctx, &page).await?;
            println!("  seeded page: {}", page.slug);
        }

        Ok(())
    }
}

fn seeded_pages() -> Vec<SeededPage<'static>> {
    vec![
        SeededPage {
            slug: "privacy-policy",
            cover_asset: "database/seeders/assets/pages/privacy-policy-cover.svg",
            title_en: "Privacy Policy",
            title_zh: "隐私政策",
            content_en: r#"
<h2>Privacy Policy</h2>
<p>We respect your privacy and collect only the information needed to operate this application responsibly.</p>
<p>This starter stores account, authentication, and activity data so teams can manage access, deliver services, and keep the platform secure.</p>
<h3>What We Collect</h3>
<ul>
  <li>Account details such as name, email address, and locale preference.</li>
  <li>Operational data such as login history, audit activity, and uploaded files you choose to provide.</li>
  <li>Technical diagnostics used to keep the application available and safe.</li>
</ul>
<h3>How We Use Data</h3>
<p>We use personal data to authenticate users, personalize the experience, respond to support requests, and improve the product.</p>
<p>We never sell personal information. Access to administrative tools is permission-controlled and logged.</p>
<h3>Your Choices</h3>
<p>You may request access, correction, or deletion of your data based on your legal requirements and internal policy. Contact <a href=\"mailto:privacy@example.com\">privacy@example.com</a> for privacy-related requests.</p>
            "#,
            content_zh: r#"
<h2>隐私政策</h2>
<p>我们重视你的隐私，只收集运营本应用所需的必要信息。</p>
<p>这个 starter 会保存账户、认证和操作相关数据，以便团队管理访问权限、提供服务并保障平台安全。</p>
<h3>我们收集的资料</h3>
<ul>
  <li>账户资料，例如姓名、邮箱地址和语言偏好。</li>
  <li>运行数据，例如登录记录、审计操作，以及你主动上传的文件。</li>
  <li>用于保持系统可用与安全的技术诊断数据。</li>
</ul>
<h3>我们如何使用资料</h3>
<p>我们会使用这些资料进行身份验证、个性化体验、处理支援请求，以及改进产品。</p>
<p>我们不会出售个人资料。后台工具会以权限控制，并保留操作记录。</p>
<h3>你的选择</h3>
<p>你可以依据适用法律与内部政策申请查阅、更正或删除资料。如有隐私相关请求，请联系 <a href=\"mailto:privacy@example.com\">privacy@example.com</a>。</p>
            "#,
        },
        SeededPage {
            slug: "terms-and-conditions",
            cover_asset: "database/seeders/assets/pages/terms-and-conditions-cover.svg",
            title_en: "Terms and Conditions",
            title_zh: "条款与条件",
            content_en: r#"
<h2>Terms and Conditions</h2>
<p>By accessing or using this application, you agree to use it responsibly, lawfully, and according to your organization's internal policies.</p>
<h3>Acceptable Use</h3>
<ul>
  <li>Do not attempt to bypass permissions, security checks, or audit controls.</li>
  <li>Do not upload unlawful, malicious, or misleading content.</li>
  <li>Do not use the platform in a way that degrades service for other users.</li>
</ul>
<h3>Content and Assets</h3>
<p>You remain responsible for the content you create or upload, including rich text, attachments, and configuration changes performed through administrative tools.</p>
<p>System pages may be updated for legal or operational reasons. Continued use after an update means you accept the latest version.</p>
<h3>Support</h3>
<p>If you have questions about these terms, contact <a href=\"mailto:legal@example.com\">legal@example.com</a>.</p>
            "#,
            content_zh: r#"
<h2>条款与条件</h2>
<p>当你访问或使用本应用时，即表示你同意以负责任、合法并符合组织内部政策的方式使用本系统。</p>
<h3>可接受使用</h3>
<ul>
  <li>不得尝试绕过权限控制、安全检查或审计机制。</li>
  <li>不得上传违法、恶意或具有误导性的内容。</li>
  <li>不得以影响其他用户服务体验的方式使用平台。</li>
</ul>
<h3>内容与附件</h3>
<p>你需要对自己创建或上传的内容负责，包括富文本内容、附件，以及通过后台工具执行的配置修改。</p>
<p>系统页面可能因法律或运营需求而更新。若你在更新后继续使用，即表示接受最新版本。</p>
<h3>联系支援</h3>
<p>如果你对这些条款有任何疑问，请联系 <a href=\"mailto:legal@example.com\">legal@example.com</a>。</p>
            "#,
        },
    ]
}

async fn seed_page(ctx: &SeederContext<'_>, spec: &SeededPage<'_>) -> Result<()> {
    let app = ctx.app();
    let page = ensure_page(app, spec.slug).await?;

    ensure_translation(app, &page, "en", "title", spec.title_en).await?;
    ensure_translation(app, &page, "zh", "title", spec.title_zh).await?;
    ensure_translation(app, &page, "en", "content", spec.content_en.trim()).await?;
    ensure_translation(app, &page, "zh", "content", spec.content_zh.trim()).await?;
    ensure_cover(app, &page, spec.cover_asset).await?;

    Ok(())
}

async fn ensure_page(app: &AppContext, slug: &str) -> Result<Page> {
    let existing = Page::model_query()
        .where_(Page::SLUG.eq(slug))
        .first(app)
        .await?;

    match existing {
        Some(page) if page.is_system => Ok(page),
        Some(page) => page
            .update()
            .set(Page::IS_SYSTEM, true)
            .set(Page::UPDATED_AT, Some(DateTime::now()))
            .save(app)
            .await,
        None => {
            let now = DateTime::now();
            Page::model_create()
                .set(Page::SLUG, slug)
                .set(Page::IS_SYSTEM, true)
                .set(Page::UPDATED_AT, Some(now))
                .save(app)
                .await
        }
    }
}

async fn ensure_translation(
    app: &AppContext,
    page: &Page,
    locale: &str,
    field: &str,
    value: &str,
) -> Result<()> {
    let existing = page.translation(app, locale, field).await?;
    let should_seed = existing
        .as_deref()
        .map(str::trim)
        .is_none_or(|current| current.is_empty());

    if should_seed {
        page.set_translation(app, locale, field, value).await?;
    }

    Ok(())
}

async fn ensure_cover(app: &AppContext, page: &Page, relative_asset_path: &str) -> Result<()> {
    if page.attachment(app, PAGE_COVER_COLLECTION).await?.is_some() {
        return Ok(());
    }

    let asset_path = Path::new(env!("CARGO_MANIFEST_DIR")).join(relative_asset_path);
    let metadata = tokio::fs::metadata(&asset_path).await.map_err(Error::other)?;
    let original_name = asset_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("cover.svg")
        .to_string();

    page.attach(
        app,
        PAGE_COVER_COLLECTION,
        UploadedFile {
            field_name: "cover".to_string(),
            original_name: Some(original_name),
            content_type: Some("image/svg+xml".to_string()),
            size: metadata.len(),
            temp_path: asset_path,
        },
    )
    .await?;

    Ok(())
}
