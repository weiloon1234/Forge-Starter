import type { LightboxImage } from "@shared/types/form";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

interface LightboxProps {
  open: boolean;
  onClose: () => void;
  images: (string | LightboxImage)[];
  initialIndex?: number;
  alt?: string;
}

export function Lightbox({
  open,
  onClose,
  images,
  initialIndex = 0,
  alt = "",
}: LightboxProps) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(initialIndex);

  const normalizedImages = useMemo(
    () => images.map((img) => (typeof img === "string" ? { src: img } : img)),
    [images],
  );

  useEffect(() => {
    if (open) setIndex(initialIndex);
  }, [open, initialIndex]);

  const hasPrev = index > 0;
  const hasNext = index < normalizedImages.length - 1;

  const prev = useCallback(() => {
    if (hasPrev) setIndex((i) => i - 1);
  }, [hasPrev]);

  const next = useCallback(() => {
    if (hasNext) setIndex((i) => i + 1);
  }, [hasNext]);

  // Keyboard: Escape, Left, Right
  useEffect(() => {
    if (!open) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose, prev, next]);

  // Lock body scroll
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Preload adjacent images
  useEffect(() => {
    if (!open) return;
    [normalizedImages[index - 1], normalizedImages[index + 1]]
      .filter(Boolean)
      .forEach((item) => {
        const img = new Image();
        img.src = item.src;
      });
  }, [open, index, normalizedImages]);

  if (!open || normalizedImages.length === 0) return null;

  const current = normalizedImages[index];

  return (
    <div className="sf-lightbox-overlay">
      <button
        type="button"
        className="sf-lightbox-backdrop"
        onClick={onClose}
        aria-label={t("Close")}
      />
      <button
        type="button"
        className="sf-lightbox-close"
        onClick={onClose}
        aria-label={t("Close")}
      >
        <X size={24} />
      </button>

      {hasPrev && (
        <button
          type="button"
          className="sf-lightbox-prev"
          onClick={prev}
          aria-label={t("Previous")}
        >
          <ChevronLeft size={32} />
        </button>
      )}

      <img
        className="sf-lightbox-image"
        src={current.src}
        alt={alt}
        draggable={false}
      />

      {(current.title || current.subtitle) && (
        <div className="sf-lightbox-caption">
          {current.title && (
            <div className="sf-lightbox-title">{current.title}</div>
          )}
          {current.subtitle && (
            <div className="sf-lightbox-subtitle">{current.subtitle}</div>
          )}
        </div>
      )}

      {hasNext && (
        <button
          type="button"
          className="sf-lightbox-next"
          onClick={next}
          aria-label={t("Next")}
        >
          <ChevronRight size={32} />
        </button>
      )}

      {normalizedImages.length > 1 && (
        <div className="sf-lightbox-counter">
          {index + 1} / {normalizedImages.length}
        </div>
      )}
    </div>
  );
}
