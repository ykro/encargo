"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="wrap empty page-empty" role="alert">
      <p className="eyebrow">Algo falló</p>
      <h1>No pudimos cargar esta página</h1>
      <p>Tu carrito sigue guardado. Intenta de nuevo en unos segundos.</p>
      <p className="empty-actions">
        <button type="button" className="btn-primary" onClick={reset}>
          Reintentar
        </button>
        <a className="btn-secondary" href="/">
          Ir al inicio
        </a>
      </p>
    </div>
  );
}
