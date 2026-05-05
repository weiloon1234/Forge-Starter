use async_trait::async_trait;
use forge::prelude::*;

pub struct Entry;

struct SeedBank<'a> {
    name_en: &'a str,
    name_zh: &'a str,
}

const COUNTRY_ISO2: &str = "MY";

const BANKS: &[SeedBank<'_>] = &[
    SeedBank { name_en: "Maybank", name_zh: "马来亚银行" },
    SeedBank { name_en: "CIMB Bank", name_zh: "联昌国际银行" },
    SeedBank { name_en: "Public Bank", name_zh: "大众银行" },
    SeedBank { name_en: "RHB Bank", name_zh: "兴业银行" },
    SeedBank { name_en: "Hong Leong Bank", name_zh: "丰隆银行" },
    SeedBank { name_en: "AmBank", name_zh: "大马银行" },
    SeedBank { name_en: "Bank Islam", name_zh: "伊斯兰银行" },
    SeedBank { name_en: "Bank Rakyat", name_zh: "人民银行" },
    SeedBank { name_en: "Bank Simpanan Nasional", name_zh: "国民储蓄银行" },
    SeedBank { name_en: "Affin Bank", name_zh: "艾芬银行" },
    SeedBank { name_en: "Alliance Bank", name_zh: "联盟银行" },
    SeedBank { name_en: "MBSB Bank", name_zh: "MBSB银行" },
    SeedBank { name_en: "OCBC Bank", name_zh: "华侨银行" },
    SeedBank { name_en: "HSBC Bank Malaysia", name_zh: "汇丰银行" },
    SeedBank { name_en: "Standard Chartered", name_zh: "渣打银行" },
    SeedBank { name_en: "UOB Bank", name_zh: "大华银行" },
    SeedBank { name_en: "Citibank Malaysia", name_zh: "花旗银行" },
    SeedBank { name_en: "Bank Muamalat", name_zh: "慕阿玛拉银行" },
    SeedBank { name_en: "Agrobank", name_zh: "农业银行" },
];

#[async_trait]
impl SeederFile for Entry {
    async fn run(ctx: &SeederContext<'_>) -> Result<()> {
        for bank in BANKS {
            let existing = ctx
                .raw_query(
                    r#"
                    SELECT b.id
                    FROM banks b
                    JOIN model_translations mt
                      ON mt.translatable_type = 'banks'
                     AND mt.translatable_id = b.id
                     AND mt.locale = 'en'
                     AND mt.field = 'name'
                     AND mt.value = $1
                    WHERE b.country_iso2 = $2
                      AND b.deleted_at IS NULL
                    LIMIT 1
                    "#,
                    &[
                        DbValue::Text(bank.name_en.to_string()),
                        DbValue::Text(COUNTRY_ISO2.to_string()),
                    ],
                )
                .await?;

            let id = if let Some(row) = existing.first() {
                row.text_or_uuid("id")
            } else {
                let rows = ctx
                    .raw_query(
                        r#"
                        INSERT INTO banks (id, country_iso2, created_at, updated_at)
                        VALUES (uuidv7(), $1, NOW(), NOW())
                        RETURNING id
                        "#,
                        &[DbValue::Text(COUNTRY_ISO2.to_string())],
                    )
                    .await?;

                rows.first().map(|row| row.text_or_uuid("id")).unwrap_or_default()
            };

            upsert_name(ctx, &id, "en", bank.name_en).await?;
            upsert_name(ctx, &id, "zh", bank.name_zh).await?;
        }

        Ok(())
    }
}

async fn upsert_name(ctx: &SeederContext<'_>, id: &str, locale: &str, value: &str) -> Result<()> {
    ctx.raw_execute(
        r#"
        INSERT INTO model_translations
            (id, translatable_type, translatable_id, locale, field, value, created_at)
        VALUES (uuidv7(), 'banks', $1::uuid, $2, 'name', $3, NOW())
        ON CONFLICT (translatable_type, translatable_id, locale, field)
        DO UPDATE SET value = $3, updated_at = NOW()
        "#,
        &[
            DbValue::Text(id.to_string()),
            DbValue::Text(locale.to_string()),
            DbValue::Text(value.to_string()),
        ],
    )
    .await?;

    Ok(())
}
