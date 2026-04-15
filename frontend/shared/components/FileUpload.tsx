import { useState, useRef, useEffect, useMemo } from "react";
import type { FileUploadProps } from "@shared/types/form";
import { FieldMessages, fieldClasses } from "./FieldMessages";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / Math.pow(1024, i);
  return `${size.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function isImage(file: File): boolean {
  return file.type.startsWith("image/");
}

export function FileUpload({
  name,
  value,
  onChange,
  label,
  errors: propErrors,
  hints,
  disabled,
  required,
  className,
  multiple,
  accept,
  maxSize,
  maxFiles,
  preview = true,
}: FileUploadProps) {
  const [dragover, setDragover] = useState(false);
  const [localErrors, setLocalErrors] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const files = useMemo(() => {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  }, [value]);

  const allErrors = useMemo(() => {
    const errs = [...(propErrors ?? []), ...localErrors];
    return errs.length > 0 ? errs : undefined;
  }, [propErrors, localErrors]);

  const hasErrors = !!(allErrors && allErrors.length > 0);

  const previewUrls = useMemo(() => {
    return files.map((f) => (isImage(f) ? URL.createObjectURL(f) : null));
  }, [files]);

  useEffect(() => {
    return () => {
      previewUrls.forEach((url) => { if (url) URL.revokeObjectURL(url); });
    };
  }, [previewUrls]);

  const validate = (incoming: File[]): File[] => {
    const errors: string[] = [];
    let valid = incoming;

    if (maxSize) {
      const oversized = valid.filter((f) => f.size > maxSize);
      if (oversized.length > 0) {
        errors.push(
          `File${oversized.length > 1 ? "s" : ""} exceed max size of ${formatBytes(maxSize)}`
        );
        valid = valid.filter((f) => f.size <= maxSize);
      }
    }

    if (maxFiles && files.length + valid.length > maxFiles) {
      errors.push(`Maximum ${maxFiles} file${maxFiles > 1 ? "s" : ""} allowed`);
      valid = valid.slice(0, maxFiles - files.length);
    }

    setLocalErrors(errors);
    return valid;
  };

  const addFiles = (incoming: File[]) => {
    const valid = validate(incoming);
    if (valid.length === 0) return;

    if (multiple) {
      onChange?.([...files, ...valid]);
    } else {
      onChange?.(valid[0]);
    }
  };

  const removeFile = (index: number) => {
    const next = files.filter((_, i) => i !== index);
    if (multiple) {
      onChange?.(next.length > 0 ? next : null);
    } else {
      onChange?.(null);
    }
  };

  const handleClick = () => {
    if (!disabled) inputRef.current?.click();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (fileList) addFiles(Array.from(fileList));
    e.target.value = "";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragover(true);
  };

  const handleDragLeave = () => {
    setDragover(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragover(false);
    if (disabled) return;
    const fileList = e.dataTransfer.files;
    if (fileList) addFiles(Array.from(fileList));
  };

  const classes = fieldClasses({ hasErrors, disabled, className });

  const dropzoneClasses = [
    "sf-file-dropzone",
    dragover && "sf-file-dropzone--dragover",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes}>
      {label && (
        <label className={`sf-label${required ? " sf-label--required" : ""}`}>
          {label}
        </label>
      )}

      <div
        className={dropzoneClasses}
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <span className="sf-file-dropzone-icon">{"\uD83D\uDCC1"}</span>
        <span className="sf-file-dropzone-text">
          Drop files here or click to browse
        </span>
      </div>

      <input
        type="file"
        name={name}
        ref={inputRef}
        hidden
        accept={accept}
        multiple={multiple}
        onChange={handleInputChange}
        disabled={disabled}
      />

      {files.length > 0 && (
        <div className="sf-file-list">
          {files.map((file, i) => (
            <div key={i} className="sf-file-item">
              {preview && previewUrls[i] ? (
                <img
                  className="sf-file-preview"
                  src={previewUrls[i]}
                  alt={file.name}
                />
              ) : (
                <div className="sf-file-preview">{"\uD83D\uDCC4"}</div>
              )}
              <div className="sf-file-info">
                <p className="sf-file-name">{file.name}</p>
                <p className="sf-file-size">{formatBytes(file.size)}</p>
              </div>
              <button
                type="button"
                className="sf-file-remove"
                onClick={() => removeFile(i)}
                disabled={disabled}
              >
                {"\u2715"}
              </button>
            </div>
          ))}
        </div>
      )}

      <FieldMessages hints={hints} errors={allErrors} />
    </div>
  );
}
