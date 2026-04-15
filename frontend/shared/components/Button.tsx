import type { ButtonProps } from "@shared/types/form";

export function Button({
  children,
  variant = "primary",
  size = "md",
  type = "button",
  busy = false,
  disabled = false,
  fullWidth = false,
  iconOnly = false,
  prefix,
  suffix,
  onClick,
  href,
  target,
  rel,
  className,
  form,
  tabIndex,
}: ButtonProps) {
  const isDisabled = disabled || busy;

  const classes = [
    "sf-button",
    `sf-button--${variant}`,
    `sf-button--${size}`,
    isDisabled && "sf-button--disabled",
    busy && "sf-button--busy",
    fullWidth && "sf-button--full-width",
    iconOnly && "sf-button--icon-only",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const content = (
    <>
      {busy && <span className="sf-button-spinner" aria-hidden="true" />}
      <span className={`sf-button-content${busy ? " sf-button-content--hidden" : ""}`}>
        {prefix && <span className="sf-button-prefix">{prefix}</span>}
        {children}
        {suffix && <span className="sf-button-suffix">{suffix}</span>}
      </span>
    </>
  );

  // Render as <a> if href is provided (link mode)
  if (href && !isDisabled) {
    return (
      <a
        href={href}
        target={target}
        rel={rel ?? (target === "_blank" ? "noopener noreferrer" : undefined)}
        className={classes}
        tabIndex={tabIndex}
        onClick={onClick}
      >
        {content}
      </a>
    );
  }

  return (
    <button
      type={type}
      className={classes}
      disabled={isDisabled}
      onClick={onClick}
      form={form}
      tabIndex={tabIndex}
    >
      {content}
    </button>
  );
}
