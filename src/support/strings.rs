pub fn trimmed_string(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

pub fn normalized_email(value: Option<&str>) -> Option<String> {
    trimmed_string(value).map(|value| value.to_ascii_lowercase())
}

pub fn normalized_iso2(value: Option<&str>) -> Option<String> {
    trimmed_string(value).map(|value| value.to_ascii_uppercase())
}

#[cfg(test)]
mod tests {
    use super::{normalized_email, normalized_iso2, trimmed_string};

    #[test]
    fn trimmed_string_discards_blank_values() {
        assert_eq!(trimmed_string(Some("  hello  ")), Some("hello".to_string()));
        assert_eq!(trimmed_string(Some("   ")), None);
        assert_eq!(trimmed_string(None), None);
    }

    #[test]
    fn normalized_email_lowercases_after_trimming() {
        assert_eq!(
            normalized_email(Some("  USER@Example.com ")),
            Some("user@example.com".to_string())
        );
    }

    #[test]
    fn normalized_iso2_uppercases_after_trimming() {
        assert_eq!(normalized_iso2(Some(" my ")), Some("MY".to_string()));
    }
}
