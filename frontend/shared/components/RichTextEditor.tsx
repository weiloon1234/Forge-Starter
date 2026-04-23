import { getToken } from "@shared/api";
import type { RichTextEditorProps } from "@shared/types/form";
import type { ComponentType } from "react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FieldShell } from "./FieldShell";

interface FroalaEditorProps {
  tag?: string;
  config?: object;
  model?: string | object | null;
  onModelChange?: (value: string | object | null) => void;
  skipReset?: boolean;
}

let froalaEditorPromise: Promise<ComponentType<FroalaEditorProps>> | null =
  null;

async function loadFroalaEditor() {
  if (!froalaEditorPromise) {
    froalaEditorPromise = Promise.all([
      import("font-awesome/css/font-awesome.css"),
      import("froala-editor/css/froala_editor.pkgd.min.css"),
      import("froala-editor/css/froala_style.min.css"),
      import("froala-editor/js/froala_editor.pkgd.min.js"),
      import("react-froala-wysiwyg"),
    ]).then(
      ([, , , , module]) => module.default as ComponentType<FroalaEditorProps>,
    );
  }

  return froalaEditorPromise;
}

export function RichTextEditor({
  name,
  label,
  value,
  onChange,
  onBlur,
  placeholder,
  errors,
  hints,
  disabled,
  required,
  className,
  uploadEndpoint,
  uploadFolder,
}: RichTextEditorProps) {
  const { t, i18n } = useTranslation();
  const [Editor, setEditor] = useState<ComponentType<FroalaEditorProps> | null>(
    null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void loadFroalaEditor()
      .then((component) => {
        if (!active) return;
        setEditor(() => component);
        setLoadError(null);
      })
      .catch(() => {
        if (!active) return;
        setLoadError(t("form.richtext_load_failed"));
      });

    return () => {
      active = false;
    };
  }, [t]);

  const requestHeaders = useMemo(() => {
    const token = getToken();

    return {
      Accept: "application/json",
      "Accept-Language": i18n.language,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }, [i18n.language]);

  const config = useMemo(
    () => ({
      attribution: false,
      charCounterCount: false,
      fileUploadMethod: "POST",
      fileUploadParam: "file",
      fileUploadParams: {
        folder: uploadFolder,
        kind: "file",
      },
      fileUploadURL: uploadEndpoint,
      imageUploadMethod: "POST",
      imageUploadParam: "file",
      imageUploadParams: {
        folder: uploadFolder,
        kind: "image",
      },
      imageUploadURL: uploadEndpoint,
      placeholderText: placeholder,
      requestHeaders,
      toolbarSticky: false,
      events: {
        blur: () => {
          onBlur?.();
        },
        initialized(this: { edit?: { off?: () => void } }) {
          if (disabled) {
            this.edit?.off?.();
          }
        },
      },
    }),
    [
      disabled,
      onBlur,
      placeholder,
      requestHeaders,
      uploadEndpoint,
      uploadFolder,
    ],
  );

  const allErrors = useMemo(() => {
    const combined = [...(errors ?? [])];
    if (loadError) {
      combined.push(loadError);
    }
    return combined.length > 0 ? combined : undefined;
  }, [errors, loadError]);

  const hasErrors = !!(allErrors && allErrors.length > 0);

  return (
    <FieldShell
      label={label}
      errors={allErrors}
      hints={hints}
      disabled={disabled}
      required={required}
      className={className}
      hasErrors={hasErrors}
      htmlFor={name}
    >
      <div className="sf-richtext-shell">
        {Editor ? (
          <Editor
            tag="textarea"
            config={config}
            model={value ?? ""}
            onModelChange={(nextValue) => {
              onChange?.(typeof nextValue === "string" ? nextValue : "");
            }}
            skipReset
          />
        ) : (
          <div className="sf-richtext-loading" aria-busy="true">
            {t("form.richtext_loading")}
          </div>
        )}
      </div>
    </FieldShell>
  );
}
