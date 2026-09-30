import { Wordmark } from "./Logo";

export function PhoneTop({ step, of = 4 }: { step?: number; of?: number }) {
  return (
    <header className="phone-top">
      <a href="/" aria-label="Encargo, inicio" style={{ textDecoration: "none" }}>
        <Wordmark />
      </a>
      {step ? (
        <span className="stepper" aria-label={`Paso ${step} de ${of}`}>
          {Array.from({ length: of }, (_, i) => (
            <i key={i} className={i < step ? "on" : ""} />
          ))}
          <span aria-hidden>
            Paso {step} de {of}
          </span>
        </span>
      ) : null}
    </header>
  );
}
