import type { InputProps } from "../types/form";

export function Input({
  name,
  type = "text",
  value,
  defaultValue,
  onChange,
  onFocus,
  onBlur,
  onPrefocus,
  placeholder,
  label,
  errors,
  hints,
  disabled,
  readOnly,
  required,
  autoFocus,
  className,
  prefix,
  suffix,
  maxLength,
  rows,
  inputRef,
}: InputProps) {
  const hasErrors = errors && errors.length > 0;
  const fieldClasses = [
    "sf-field",
    hasErrors && "sf-field--error",
    disabled && "sf-field--disabled",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    onChange?.(e.target.value);
  };

  const handleMouseDown = () => {
    onPrefocus?.();
  };

  const isTextarea = type === "textarea";

  return (
    <div className={fieldClasses}>
      {label && (
        <label
          className={`sf-label${required ? " sf-label--required" : ""}`}
          htmlFor={name}
        >
          {label}
        </label>
      )}

      {isTextarea ? (
        <textarea
          id={name}
          name={name}
          className="sf-textarea"
          value={value}
          defaultValue={defaultValue}
          onChange={handleChange}
          onFocus={onFocus}
          onBlur={onBlur}
          onMouseDown={handleMouseDown}
          onTouchStart={handleMouseDown}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={readOnly}
          autoFocus={autoFocus}
          maxLength={maxLength}
          rows={rows ?? 4}
          ref={inputRef as React.RefObject<HTMLTextAreaElement | null>}
        />
      ) : (
        <div className="sf-input-wrapper">
          {prefix && <span className="sf-input-prefix">{prefix}</span>}
          <input
            id={name}
            name={name}
            type={type}
            className="sf-input"
            value={value}
            defaultValue={defaultValue}
            onChange={handleChange}
            onFocus={onFocus}
            onBlur={onBlur}
            onMouseDown={handleMouseDown}
            onTouchStart={handleMouseDown}
            placeholder={placeholder}
            disabled={disabled}
            readOnly={readOnly}
            autoFocus={autoFocus}
            maxLength={maxLength}
            ref={inputRef as React.RefObject<HTMLInputElement | null>}
          />
          {suffix && <span className="sf-input-suffix">{suffix}</span>}
        </div>
      )}

      {hints && hints.length > 0 && (
        <div className="sf-hints">
          {hints.map((hint, i) => (
            <p key={i} className="sf-hint">
              {hint}
            </p>
          ))}
        </div>
      )}

      {hasErrors && (
        <div className="sf-errors">
          {errors.map((err, i) => (
            <p key={i} className="sf-error">
              {err}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
