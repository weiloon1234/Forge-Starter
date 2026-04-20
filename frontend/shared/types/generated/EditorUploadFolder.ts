// Auto-generated from AppEnum. Do not edit.

export type EditorUploadFolder = "settings.content" | "pages.content";

export const EditorUploadFolderValues = [
  "settings.content",
  "pages.content",
] as const;

export const EditorUploadFolderOptions = [
  { value: "settings.content", labelKey: "enum.editor_upload_folder.settings_content" },
  { value: "pages.content", labelKey: "enum.editor_upload_folder.pages_content" },
] as const;

export const EditorUploadFolderMeta = {
id: "editor_upload_folder",
keyKind: "string",
options: EditorUploadFolderOptions,
} as const;
