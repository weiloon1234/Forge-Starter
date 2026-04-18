use forge::countries::CountryStatus;
use forge::prelude::*;
use serde::Serialize;

#[derive(Serialize, forge::Model)]
#[forge(
    model = "countries",
    primary_key = "iso2",
    primary_key_strategy = "manual"
)]
pub struct Country {
    pub iso2: String,
    pub iso3: String,
    pub name: String,
    pub official_name: Option<String>,
    pub region: Option<String>,
    pub subregion: Option<String>,
    pub primary_currency_code: Option<String>,
    pub calling_code: Option<String>,
    pub flag_emoji: Option<String>,
    pub conversion_rate: Option<f64>,
    pub is_default: bool,
    pub status: CountryStatus,
    pub created_at: DateTime,
    pub updated_at: Option<DateTime>,
}
