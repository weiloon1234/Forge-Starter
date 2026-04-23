use forge::prelude::*;

pub fn available_locales(app: &AppContext) -> Vec<String> {
    app.i18n()
        .map(|manager| {
            manager
                .locale_list()
                .into_iter()
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_else(|_| vec!["en".to_string()])
}

pub fn default_locale(app: &AppContext) -> String {
    app.i18n()
        .map(|manager| manager.default_locale().to_string())
        .unwrap_or_else(|_| "en".to_string())
}
