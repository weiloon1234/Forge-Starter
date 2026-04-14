import { useState, useEffect, useCallback } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

interface LightboxProps {
  open: boolean;
  onClose: () => void;
  images: string[];
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
  const [index, setIndex] = useState(initialIndex);

  useEffect(() => {
    if (open) setIndex(initialIndex);
  }, [open, initialIndex]);

  const hasPrev = index > 0;
  const hasNext = index < images.length - 1;

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
    [images[index - 1], images[index + 1]].filter(Boolean).forEach((src) => {
      const img = new Image();
      img.src = src;
    });
  }, [open, index, images]);

  if (!open || images.length === 0) return null;

  return (
    <div
      className="sf-lightbox-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <button
        className="sf-lightbox-close"
        onClick={onClose}
        aria-label="Close"
      >
        <X size={24} />
      </button>

      {hasPrev && (
        <button
          className="sf-lightbox-prev"
          onClick={prev}
          aria-label="Previous"
        >
          <ChevronLeft size={32} />
        </button>
      )}

      <img
        className="sf-lightbox-image"
        src={images[index]}
        alt={alt}
        draggable={false}
      />

      {hasNext && (
        <button
          className="sf-lightbox-next"
          onClick={next}
          aria-label="Next"
        >
          <ChevronRight size={32} />
        </button>
      )}

      {images.length > 1 && (
        <div className="sf-lightbox-counter">
          {index + 1} / {images.length}
        </div>
      )}
    </div>
  );
}
