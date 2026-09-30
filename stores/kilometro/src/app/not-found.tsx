export default function NotFound() {
  return (
    <div className="wrap empty page-empty">
      <p className="eyebrow">Error 404</p>
      <h1>Este kilómetro no existe</h1>
      <p>La página que buscas no está. Quizá el modelo cambió de nombre o el enlace está incompleto.</p>
      <p className="empty-actions">
        <a className="btn-primary" href="/">
          Ver todos los tenis
        </a>
        <a className="btn-secondary" href="/envios">
          Envíos
        </a>
      </p>
    </div>
  );
}
