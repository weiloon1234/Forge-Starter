import { Button, FileUpload, Input, RichTextEditor } from "@shared/components";
import { useRuntimeStore } from "@shared/config";
import { useForm } from "@shared/hooks";
import { getLocaleLabel } from "@shared/i18n/localeLabels";
import { ModalBody, ModalFooter, modal } from "@shared/modal";
import type {
  AdminPageResponse,
  EditorUploadFolder,
  Permission,
} from "@shared/types/generated";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { api } from "@/api";
import { auth } from "@/auth";
import { ConfirmDeletePageModal } from "@/components/ConfirmDeletePageModal";
import { hasPermission } from "@/hooks/usePermission";
import {
  buildCreatePagePayload,
  buildUpdatePagePayload,
  contentFieldKey,
  emptyPageFormValues,
  type PageFormValues,
  pageFormValuesFromResponse,
  titleFieldKey,
} from "@/pageForm";
import { formatFileSize } from "@/settings";

const FORM_ID = "page-form-modal";
const PAGES_MANAGE: Permission = "pages.manage";
const PAGES_CONTENT_FOLDER = "pages.content" as EditorUploadFolder;

type ModalMode = "create" | "edit" | "view";

interface PageFormModalProps {
  pageId?: string;
  onSaved?: () => void;
  onClose: () => void;
}

function modeTitleKey(mode: ModalMode): string {
  switch (mode) {
    case "create":
      return "admin.pages.create_title";
    case "edit":
      return "admin.pages.edit_title";
    case "view":
      return "admin.pages.view_title";
  }
}

function modeHelpKey(mode: ModalMode): string {
  switch (mode) {
    case "create":
      return "admin.pages.create_help";
    case "edit":
      return "admin.pages.edit_help";
    case "view":
      return "admin.pages.view_help";
  }
}

export function PageFormModal({
  pageId,
  onSaved,
  onClose,
}: PageFormModalProps) {
  const { t } = useTranslation();
  const { config } = useRuntimeStore();
  const { user } = auth.useAuth();
  const canManagePages = hasPermission(
    user?.abilities,
    PAGES_MANAGE,
    user?.admin_type,
  );
  const locales = useMemo(() => {
    const configured = config.locales.length > 0 ? config.locales : ["en"];
    return Array.from(new Set([config.default_locale, ...configured]));
  }, [config.default_locale, config.locales]);
  const isCreate = !pageId;

  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [page, setPage] = useState<AdminPageResponse | null>(null);
  const [mode, setMode] = useState<ModalMode>(isCreate ? "create" : "view");
  const [activeLocale, setActiveLocale] = useState(config.default_locale);
  const [selectedCover, setSelectedCover] = useState<File | null>(null);
  const [removeCover, setRemoveCover] = useState(false);

  const form = useForm<PageFormValues>({
    initialValues: emptyPageFormValues(locales),
    onSubmit: async (values) => {
      const savedPage = isCreate
        ? (
            await api.post<AdminPageResponse>(
              "/pages",
              buildCreatePagePayload(values, locales),
            )
          ).data
        : (
            await api.put<AdminPageResponse>(
              `/pages/${pageId}`,
              buildUpdatePagePayload(values, locales),
            )
          ).data;

      try {
        if (selectedCover) {
          const formData = new FormData();
          formData.append("file", selectedCover);
          await api.post(`/pages/${savedPage.id}/cover`, formData);
        } else if (removeCover && page?.cover) {
          await api.delete(`/pages/${savedPage.id}/cover`);
        }
      } catch {
        toast.error(t("admin.pages.cover_save_failed"));
      }

      toast.success(
        t(isCreate ? "admin.pages.created" : "admin.pages.updated"),
      );
      onSaved?.();
      onClose();
    },
  });
  const { clearErrors, setValues } = form;

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setLoadFailed(false);
      setPage(null);
      setSelectedCover(null);
      setRemoveCover(false);
      clearErrors();
      setActiveLocale(config.default_locale);

      if (isCreate) {
        if (!canManagePages) {
          onClose();
          return;
        }

        if (!active) {
          return;
        }

        setMode("create");
        setValues(emptyPageFormValues(locales));
        setLoading(false);
        return;
      }

      try {
        const { data } = await api.get<AdminPageResponse>(`/pages/${pageId}`);

        if (!active) {
          return;
        }

        setPage(data);
        setMode(canManagePages ? "edit" : "view");
        setValues(pageFormValuesFromResponse(data, locales));
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
  }, [
    canManagePages,
    clearErrors,
    config.default_locale,
    isCreate,
    locales,
    onClose,
    pageId,
    setValues,
  ]);

  const isViewMode = mode === "view";
  const slugField = form.field("slug");
  const titleField = form.field(
    titleFieldKey(activeLocale) as keyof PageFormValues,
  );
  const contentField = form.field(
    contentFieldKey(activeLocale) as keyof PageFormValues,
  );
  const activeLocaleLabel = getLocaleLabel(activeLocale, t);
  const defaultLocaleHint =
    activeLocale === config.default_locale
      ? [t("admin.pages.default_locale_hint")]
      : undefined;

  const handleDelete = () => {
    if (!page) {
      return;
    }

    modal.open(
      ConfirmDeletePageModal,
      {
        slug: page.slug,
        onConfirm: async () => {
          await api.delete(`/pages/${page.id}`);
          toast.success(t("admin.pages.deleted"));
          onSaved?.();
          onClose();
        },
      },
      {
        title: t("admin.pages.delete_title", { slug: page.slug }),
      },
    );
  };

  const renderCover = () => {
    if (!page?.cover) {
      return (
        <div className="sf-setting-asset-empty">
          {removeCover
            ? t("admin.pages.cover_will_remove")
            : t("admin.pages.no_cover")}
        </div>
      );
    }

    if (removeCover) {
      return (
        <div className="sf-setting-asset-empty">
          {t("admin.pages.cover_will_remove")}
        </div>
      );
    }

    return (
      <div className="sf-setting-asset-card">
        <img
          className="sf-setting-asset-preview"
          src={page.cover.url}
          alt={page.cover.name}
        />
        <div className="sf-setting-asset-meta">
          <div className="sf-setting-asset-name">{page.cover.name}</div>
          <div className="sf-setting-asset-details">
            {page.cover.mime_type ?? t("setting_type.image")} ·{" "}
            {formatFileSize(page.cover.size_bytes)}
          </div>
        </div>
        {!isViewMode && (
          <div className="sf-setting-asset-actions">
            <a
              className="sf-setting-asset-link"
              href={page.cover.url}
              target="_blank"
              rel="noreferrer"
            >
              {t("admin.pages.preview_cover")}
            </a>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setSelectedCover(null);
                setRemoveCover(true);
              }}
            >
              {t("admin.pages.remove_cover")}
            </Button>
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <ModalBody>
        <div className="sf-page-subtitle">{t("Loading")}</div>
      </ModalBody>
    );
  }

  if (loadFailed) {
    return (
      <>
        <ModalBody>
          <div className="sf-form-error-banner">
            {t("admin.pages.load_failed")}
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" size="sm" onClick={onClose}>
            {t("Close")}
          </Button>
        </ModalFooter>
      </>
    );
  }

  return (
    <>
      <ModalBody>
        <div className="sf-admin-form-page">
          <div>
            <h3 className="sf-page-title">{t(modeTitleKey(mode))}</h3>
            <p className="sf-page-subtitle">{t(modeHelpKey(mode))}</p>
          </div>

          {form.formErrors.length > 0 && (
            <div className="sf-form-error-banner">
              {form.formErrors.map((error) => (
                <div key={error}>{error}</div>
              ))}
            </div>
          )}

          <form
            id={FORM_ID}
            className="sf-admin-form"
            onSubmit={form.handleSubmit}
          >
            <div className="sf-admin-form-section">
              <div className="sf-admin-form-section__header">
                <h2>{t("admin.pages.sections.page")}</h2>
                <p>{t("admin.pages.sections.page_help")}</p>
              </div>

              <Input
                name={slugField.name}
                label={t("admin.pages.fields.slug")}
                value={
                  typeof slugField.value === "string" ? slugField.value : ""
                }
                onChange={slugField.onChange}
                onBlur={slugField.onBlur}
                errors={slugField.errors}
                disabled={isViewMode}
                readOnly={!!page?.is_system}
                hints={
                  page?.is_system
                    ? [t("admin.pages.system_slug_hint")]
                    : [t("admin.pages.slug_hint")]
                }
              />
            </div>

            <div className="sf-admin-form-section">
              <div className="sf-admin-form-section__header">
                <h2>{t("admin.pages.sections.content")}</h2>
                <p>{t("admin.pages.sections.content_help")}</p>
              </div>

              <div className="sf-page-locale-tabs" role="tablist">
                {locales.map((locale) => (
                  <Button
                    key={locale}
                    type="button"
                    unstyled
                    className={`sf-page-locale-tab${locale === activeLocale ? " sf-page-locale-tab--active" : ""}`}
                    onClick={() => setActiveLocale(locale)}
                    ariaLabel={getLocaleLabel(locale, t)}
                    title={getLocaleLabel(locale, t)}
                  >
                    {getLocaleLabel(locale, t)}
                  </Button>
                ))}
              </div>

              <div className="sf-page-locale-panel">
                <div className="sf-page-locale-panel__header">
                  {t("admin.pages.locale_panel_title", {
                    locale: activeLocaleLabel,
                  })}
                </div>

                <Input
                  name={titleField.name}
                  label={t("admin.pages.fields.title")}
                  value={
                    typeof titleField.value === "string" ? titleField.value : ""
                  }
                  onChange={titleField.onChange}
                  onBlur={titleField.onBlur}
                  errors={titleField.errors}
                  disabled={isViewMode}
                  hints={defaultLocaleHint}
                />

                <RichTextEditor
                  name={contentField.name}
                  label={t("admin.pages.fields.content")}
                  value={
                    typeof contentField.value === "string"
                      ? contentField.value
                      : ""
                  }
                  onChange={contentField.onChange}
                  onBlur={contentField.onBlur}
                  errors={contentField.errors}
                  disabled={isViewMode}
                  hints={defaultLocaleHint}
                  uploadEndpoint="/api/v1/admin/editor-assets/upload"
                  uploadFolder={PAGES_CONTENT_FOLDER}
                />
              </div>
            </div>

            <div className="sf-admin-form-section">
              <div className="sf-admin-form-section__header">
                <h2>{t("admin.pages.sections.cover")}</h2>
                <p>{t("admin.pages.sections.cover_help")}</p>
              </div>

              {renderCover()}

              {!isViewMode && (
                <div className="mt-4">
                  <FileUpload
                    name="cover"
                    label={t("admin.pages.fields.cover")}
                    value={selectedCover}
                    onChange={(files) => {
                      const file = Array.isArray(files)
                        ? (files[0] ?? null)
                        : files;
                      setSelectedCover(file);
                      if (file) {
                        setRemoveCover(false);
                      }
                    }}
                    accept="image/*"
                    maxFiles={1}
                    preview
                    hints={[
                      t("admin.pages.cover_upload_hint"),
                      ...(removeCover
                        ? [t("admin.pages.cover_will_remove")]
                        : []),
                    ]}
                  />
                </div>
              )}
            </div>
          </form>
        </div>
      </ModalBody>

      <ModalFooter className="sf-page-modal-footer">
        {page?.is_system && !isViewMode ? (
          <div className="sf-page-modal-note">
            {t("admin.pages.system_delete_disabled")}
          </div>
        ) : (
          <div />
        )}

        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="secondary" size="sm" onClick={onClose}>
            {t(isViewMode ? "Close" : "Cancel")}
          </Button>
          {!isViewMode && (
            <>
              {!!page && !page.is_system && (
                <Button variant="danger" size="sm" onClick={handleDelete}>
                  {t("Delete")}
                </Button>
              )}
              <Button
                type="submit"
                form={FORM_ID}
                variant="primary"
                size="sm"
                busy={form.busy}
              >
                {t("Save")}
              </Button>
            </>
          )}
        </div>
      </ModalFooter>
    </>
  );
}
