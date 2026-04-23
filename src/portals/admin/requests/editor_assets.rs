use forge::prelude::*;

#[derive(Debug)]
pub struct UploadEditorAssetRequest {
    pub folder: String,
    pub kind: String,
    pub file: UploadedFile,
}

impl UploadEditorAssetRequest {
    pub fn from_multipart(i18n: &I18n, form: MultipartForm) -> Result<Self> {
        let folder = required_text(i18n, &form, "folder")?.to_string();
        let kind = required_text(i18n, &form, "kind")?.to_string();
        let file = form
            .file("file")
            .map_err(|_| missing_field_error(i18n, "file"))?;

        Ok(Self {
            folder,
            kind,
            file: UploadedFile {
                field_name: file.field_name.clone(),
                original_name: file.original_name.clone(),
                content_type: file.content_type.clone(),
                size: file.size,
                temp_path: file.temp_path.clone(),
            },
        })
    }
}

fn required_text<'a>(i18n: &I18n, form: &'a MultipartForm, field: &str) -> Result<&'a str> {
    form.text(field)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| missing_field_error(i18n, field))
}

fn missing_field_error(i18n: &I18n, field: &str) -> Error {
    let message = match field {
        "folder" => forge::t!(i18n, "admin.editor_assets.errors.folder_required"),
        "kind" => forge::t!(i18n, "admin.editor_assets.errors.kind_required"),
        "file" => forge::t!(i18n, "admin.editor_assets.errors.file_required"),
        _ => forge::t!(i18n, "validation.invalid_request_body"),
    };

    Error::http(422, message)
}
