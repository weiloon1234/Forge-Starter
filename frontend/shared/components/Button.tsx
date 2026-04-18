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
  title,
  ariaLabel,
  unstyled = false,
}: ButtonProps) {
  const isDisabled = disabled || busy;

  const classes = [
    !unstyled && "sf-button",
    !unstyled && `sf-button--${variant}`,
    !unstyled && `sf-button--${size}`,
    !unstyled && isDisabled && "sf-button--disabled",
    !unstyled && busy && "sf-button--busy",
    !unstyled && fullWidth && "sf-button--full-width",
    !unstyled && iconOnly && "sf-button--icon-only",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const content = unstyled ? (
    children
  ) : (
    <>
      {busy && <span className="sf-button-spinner" aria-hidden="true" />}
      <span
        className={`sf-button-content${busy ? " sf-button-content--hidden" : ""}`}
      >
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
        title={title}
        aria-label={ariaLabel}
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
      title={title}
      aria-label={ariaLabel}
    >
      {content}
    </button>
  );
}
