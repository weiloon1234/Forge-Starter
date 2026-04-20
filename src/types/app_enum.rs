use forge::app_enum::{EnumKey, ForgeAppEnum};

pub fn enum_key_string<E: ForgeAppEnum>(value: E) -> String {
    match value.key() {
        EnumKey::String(value) => value,
        EnumKey::Int(value) => value.to_string(),
    }
}

pub fn enum_variants<E: ForgeAppEnum>() -> Vec<E> {
    E::keys()
        .into_iter()
        .filter_map(|key| match key {
            EnumKey::String(value) => E::parse_key(&value),
            EnumKey::Int(value) => E::parse_key(&value.to_string()),
        })
        .collect()
}
