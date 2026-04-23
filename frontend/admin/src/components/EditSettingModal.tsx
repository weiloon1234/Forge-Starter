import {
  Button,
  Checkbox,
  DatePicker,
  DateTimePicker,
  FileUpload,
  Input,
  Select,
} from "@shared/components";
import { useForm } from "@shared/hooks";
import { ModalBody, ModalFooter } from "@shared/modal";
import type {
  AdminSettingAssetResponse,
  AdminSettingResponse,
  UpdateSettingValueRequest,
} from "@shared/types/generated";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { api } from "@/api";
import {
  dateStringToLocalDate,
  dateTimeStringToDate,
  dateToIsoString,
  editableSettingValue,
  formatFileSize,
  isSettingAssetValue,
  localDateToDateString,
  serializeSettingValue,
  settingAccept,
  settingLanguage,
  settingMaxLength,
  settingMaxSizeBytes,
  settingOptions,
  settingPlaceholder,
  settingRows,
  settingTypeLabel,
} from "@/settings";

interface EditSettingModalProps {
  settingKey: string;
  onSaved?: () => void;
  onClose: () => void;
}

function isUploadSetting(
  setting: AdminSettingResponse | null,
): setting is AdminSettingResponse & { setting_type: "file" | "image" } {
  return setting?.setting_type === "file" || setting?.setting_type === "image";
}

function isImageAsset(asset: AdminSettingAssetResponse | null | undefined) {
  return asset?.mime?.startsWith("image/") ?? false;
}

export function EditSettingModal({
  settingKey,
  onSaved,
  onClose,
}: EditSettingModalProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [setting, setSetting] = useState<AdminSettingResponse | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [clearAsset, setClearAsset] = useState(false);

  const form = useForm<UpdateSettingValueRequest>({
    initialValues: {
      value: "",
    },
    onSubmit: async (values) => {
      if (!setting) {
        return;
      }

      const encodedKey = encodeURIComponent(setting.key);

      if (isUploadSetting(setting)) {
        if (selectedFile) {
          const formData = new FormData();
          formData.append("file", selectedFile);
          await api.post(`/settings/${encodedKey}/upload`, formData);
        } else if (clearAsset) {
          const payload: UpdateSettingValueRequest = { value: null };
          await api.put(`/settings/${encodedKey}`, payload);
        } else {
          return;
        }

        toast.success(t("admin.settings.updated"));
        onSaved?.();
        onClose();
        return;
      }

      try {
        const payload: UpdateSettingValueRequest = {
          value: serializeSettingValue(setting.setting_type, values.value),
        };

        await api.put(`/settings/${encodedKey}`, payload);
        toast.success(t("admin.settings.updated"));
        onSaved?.();
        onClose();
      } catch (error) {
        if (error instanceof SyntaxError) {
          setFieldError("value", [t("admin.settings.errors.invalid_json")]);
          return;
        }
        if (error instanceof RangeError && error.message === "invalid_number") {
          setFieldError("value", [t("admin.settings.errors.invalid_number")]);
          return;
        }

        throw error;
      }
    },
  });
  const { clearErrors, setFieldError, setValues } = form;

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setLoadFailed(false);
      setSetting(null);
      setSelectedFile(null);
      setClearAsset(false);
      clearErrors();

      try {
        const { data } = await api.get<AdminSettingResponse>(
          `/settings/${encodeURIComponent(settingKey)}`,
        );

        if (!active) {
          return;
        }

        setSetting(data);
        setValues({
          value: editableSettingValue(data),
        });
      } catch {
        if (active) {
          setLoadFailed(true);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [clearErrors, setValues, settingKey]);

  const valueField = form.field("value");
  const parameters = setting?.parameters ?? {};
  const descriptionHints = setting?.description ? [setting.description] : [];
  const language = settingLanguage(parameters);
  const codeHints = language
    ? [...descriptionHints, t("admin.settings.language_hint", { language })]
    : descriptionHints;

  const uploadActionPending = selectedFile !== null || clearAsset;

  const handleFileChange = (files: File | File[] | null) => {
    const file = Array.isArray(files) ? (files[0] ?? null) : files;
    clearErrors();
    setSelectedFile(file);
    if (file) {
      setClearAsset(false);
    }
  };

  const renderCurrentAsset = () => {
    if (!setting || !isUploadSetting(setting)) {
      return null;
    }

    if (clearAsset) {
      return (
        <div className="sf-setting-asset-empty">
          {t("admin.settings.asset_will_clear")}
        </div>
      );
    }

    if (!setting.asset || !isSettingAssetValue(setting.asset)) {
      return (
        <div className="sf-setting-asset-empty">
          {t("admin.settings.no_asset")}
        </div>
      );
    }

    const asset = setting.asset;

    return (
      <div className="sf-setting-asset-card">
        {isImageAsset(asset) && asset.preview_url ? (
          <img
            className="sf-setting-asset-preview"
            src={asset.preview_url}
            alt={asset.name}
          />
        ) : (
          <div className="sf-setting-asset-icon">
            {settingTypeLabel(setting.setting_type, t)}
          </div>
        )}

        <div className="sf-setting-asset-meta">
          <div className="sf-setting-asset-name">{asset.name}</div>
          <div className="sf-setting-asset-details">
            {formatFileSize(Number(asset.size_bytes))}
            {asset.mime ? ` · ${asset.mime}` : ""}
            {asset.width && asset.height
              ? ` · ${asset.width}×${asset.height}`
              : ""}
          </div>
        </div>

        <div className="sf-setting-asset-actions">
          {asset.preview_url && isImageAsset(asset) && (
            <a
              className="sf-setting-asset-link"
              href={asset.preview_url}
              target="_blank"
              rel="noreferrer"
            >
              {t("admin.settings.preview")}
            </a>
          )}
          {asset.download_url && (
            <a
              className="sf-setting-asset-link"
              href={asset.download_url}
              target="_blank"
              rel="noreferrer"
            >
              {t("admin.settings.download")}
            </a>
          )}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setSelectedFile(null);
              setClearAsset(true);
            }}
          >
            {t("admin.settings.clear_asset")}
          </Button>
        </div>
      </div>
    );
  };

  const renderValueEditor = () => {
    if (!setting) {
      return null;
    }

    switch (setting.setting_type) {
      case "boolean":
        return (
          <Checkbox
            name={valueField.name}
            label={setting.label}
            checked={valueField.value === true}
            hints={descriptionHints}
            errors={valueField.errors}
            onChange={(checked) => valueField.onChange(checked)}
          />
        );
      case "select":
        return (
          <Select
            name={valueField.name}
            label={setting.label}
            value={typeof valueField.value === "string" ? valueField.value : ""}
            options={settingOptions(parameters)}
            hints={descriptionHints}
            errors={valueField.errors}
            onChange={(value) => {
              if (typeof value === "string") {
                valueField.onChange(value);
              }
            }}
          />
        );
      case "multiselect":
        return (
          <Select
            name={valueField.name}
            label={setting.label}
            multiple
            value={Array.isArray(valueField.value) ? valueField.value : []}
            options={settingOptions(parameters)}
            hints={descriptionHints}
            errors={valueField.errors}
            onChange={(value) => {
              if (Array.isArray(value)) {
                valueField.onChange(value);
              }
            }}
          />
        );
      case "date":
        return (
          <DatePicker
            name={valueField.name}
            label={setting.label}
            value={
              typeof valueField.value === "string"
                ? dateStringToLocalDate(valueField.value)
                : null
            }
            hints={descriptionHints}
            errors={valueField.errors}
            onChange={(date) =>
              valueField.onChange(localDateToDateString(date))
            }
          />
        );
      case "datetime":
        return (
          <DateTimePicker
            name={valueField.name}
            label={setting.label}
            value={
              typeof valueField.value === "string"
                ? dateTimeStringToDate(valueField.value)
                : null
            }
            hints={descriptionHints}
            errors={valueField.errors}
            onChange={(date) => valueField.onChange(dateToIsoString(date))}
          />
        );
      case "file":
      case "image":
        return (
          <div className="sf-setting-upload">
            <div className="sf-admin-form-section__header">
              <h2>{setting.label}</h2>
              <p>
                {setting.description ?? t("admin.settings.upload_replace_hint")}
              </p>
            </div>
            {renderCurrentAsset()}
            <FileUpload
              name="file"
              label={t("admin.settings.replace_asset")}
              value={selectedFile}
              accept={settingAccept(parameters)}
              maxSize={settingMaxSizeBytes(parameters)}
              maxFiles={1}
              preview={setting.setting_type === "image"}
              errors={valueField.errors}
              onChange={handleFileChange}
            />
          </div>
        );
      case "textarea":
        return (
          <Input
            name={valueField.name}
            type="textarea"
            label={setting.label}
            value={typeof valueField.value === "string" ? valueField.value : ""}
            placeholder={settingPlaceholder(parameters)}
            maxLength={settingMaxLength(parameters)}
            rows={settingRows(parameters, 5)}
            hints={descriptionHints}
            errors={valueField.errors}
            onBlur={valueField.onBlur}
            onChange={(value) => valueField.onChange(value)}
          />
        );
      case "json":
        return (
          <Input
            name={valueField.name}
            type="textarea"
            label={setting.label}
            value={typeof valueField.value === "string" ? valueField.value : ""}
            className="sf-setting-editor"
            rows={settingRows(parameters, 10)}
            hints={descriptionHints}
            errors={valueField.errors}
            onBlur={valueField.onBlur}
            onChange={(value) => valueField.onChange(value)}
          />
        );
      case "code":
        return (
          <Input
            name={valueField.name}
            type="textarea"
            label={setting.label}
            value={typeof valueField.value === "string" ? valueField.value : ""}
            className="sf-setting-editor"
            rows={settingRows(parameters, 10)}
            hints={codeHints}
            errors={valueField.errors}
            onBlur={valueField.onBlur}
            onChange={(value) => valueField.onChange(value)}
          />
        );
      default:
        return (
          <Input
            name={valueField.name}
            type={setting.setting_type}
            label={setting.label}
            value={typeof valueField.value === "string" ? valueField.value : ""}
            placeholder={settingPlaceholder(parameters)}
            maxLength={settingMaxLength(parameters)}
            hints={descriptionHints}
            errors={valueField.errors}
            onBlur={valueField.onBlur}
            onChange={(value) => valueField.onChange(value)}
          />
        );
    }
  };

  return (
    <>
      <ModalBody>
        {loading ? (
          <div className="sf-page-subtitle">{t("Loading")}</div>
        ) : loadFailed || !setting ? (
          <div className="sf-form-error-banner">
            {t("error.something_went_wrong")}
          </div>
        ) : (
          <div className="sf-admin-form space-y-4">
            <div className="sf-setting-meta-grid">
              <div>
                <div className="sf-setting-meta-label">{t("Key")}</div>
                <div className="sf-setting-meta-value">{setting.key}</div>
              </div>
              <div>
                <div className="sf-setting-meta-label">{t("Type")}</div>
                <div className="sf-setting-meta-value">
                  {settingTypeLabel(setting.setting_type, t)}
                </div>
              </div>
              <div>
                <div className="sf-setting-meta-label">{t("Group")}</div>
                <div className="sf-setting-meta-value">
                  {setting.group_name}
                </div>
              </div>
              <div>
                <div className="sf-setting-meta-label">{t("Public")}</div>
                <div className="sf-setting-meta-value">
                  {setting.is_public
                    ? t("admin.settings.public_state.public")
                    : t("admin.settings.public_state.private")}
                </div>
              </div>
            </div>

            {form.formErrors.length > 0 && (
              <div className="sf-form-error-banner">
                {form.formErrors.join(" ")}
              </div>
            )}

            {renderValueEditor()}
          </div>
        )}
      </ModalBody>

      <ModalFooter>
        <Button variant="secondary" size="sm" onClick={onClose}>
          {t("Cancel")}
        </Button>
        <Button
          variant="primary"
          size="sm"
          busy={form.busy}
          disabled={
            !!setting && isUploadSetting(setting) && !uploadActionPending
          }
          onClick={form.handleSubmit}
        >
          {t("Save")}
        </Button>
      </ModalFooter>
    </>
  );
}
