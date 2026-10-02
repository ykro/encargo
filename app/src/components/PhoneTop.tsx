import { Wordmark } from "./Logo";

export function PhoneTop({ step, of = 4, label }: { step?: number; of?: number; label?: string }) {
  return (
    <header className="phone-top">
      <a href="/" aria-label="Encargo, inicio" style={{ textDecoration: "none" }}>
        <Wordmark />
      </a>
      {step ? (
        <span className="stepper" aria-label={label ?? `Paso ${step} de ${of}`}>
          {Array.from({ length: of }, (_, i) => (
            <i key={i} className={i < step ? "on" : ""} />
          ))}
          <span aria-hidden>{label ?? `Paso ${step} de ${of}`}</span>
        </span>
      ) : null}
    </header>
  );
}
