import { Button } from "@shared/components";
import {
  getLocaleCompactLabel,
  getLocaleFlag,
  getLocaleLabel,
  localeStore,
  useLocale,
} from "@shared/i18n";
import { useTranslation } from "react-i18next";

type LocaleSwitcherVariant = "default" | "inline";

interface LocaleSwitcherProps {
  className?: string;
  onChange?: (locale: string) => void;
  variant?: LocaleSwitcherVariant;
}

export function LocaleSwitcher({
  className,
  onChange,
  variant = "default",
}: LocaleSwitcherProps) {
  const { t } = useTranslation();
  const { locale, available } = useLocale();

  const switcherClassName = [
    "sf-locale-switcher",
    variant === "inline" && "sf-locale-switcher--inline",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={switcherClassName}>
      {available.map((code) => {
        const label = getLocaleLabel(code, t);

        return (
          <Button
            key={code}
            type="button"
            unstyled
            className={[
              "sf-locale-switcher__button",
              variant === "inline" && "sf-locale-switcher__button--inline",
              locale === code && "sf-locale-switcher__button--active",
            ]
              .filter(Boolean)
              .join(" ")}
            title={label}
            ariaLabel={label}
            onClick={() => {
              if (code === locale) {
                return;
              }

              localeStore.setLocale(code);
              onChange?.(code);
            }}
          >
            {variant === "inline" ? (
              <>
                <span className="sf-locale-switcher__flag" aria-hidden="true">
                  {getLocaleFlag(code)}
                </span>
                <span className="sf-locale-switcher__label">
                  {getLocaleCompactLabel(code)}
                </span>
              </>
            ) : (
              label
            )}
          </Button>
        );
      })}
    </div>
  );
}
