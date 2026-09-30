"use client";
import { useState } from "react";

/** A product picture with a designed failure state (the facts are in the pixels, so say so). */
export function SmartImage({ src, className, priority }: { src: string; className?: string; priority?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className={`img-fallback ${className ?? ""}`} role="img" aria-label="Imagen no disponible">
        La imagen no cargó. Revisa tu conexión y vuelve a intentarlo.
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      className={className}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      onError={() => setFailed(true)}
    />
  );
}
