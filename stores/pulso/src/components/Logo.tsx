// Pulso's mark: a summit drawn as contour lines, with the ember dot at the top.
// Vector redraw of src/brand/../public/brand/logo.jpg so it stays crisp at any size.
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 80" className={className} aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 74 L40 31 C48 19 54 11 60 11 C66 11 72 19 80 31 L114 74" />
        <path d="M28 64 C35 45 48 27 60 25 C72 27 85 45 92 64 C79 72 41 72 28 64 Z" />
        <path d="M40 59 C46 47 52 39 60 38 C68 39 74 47 80 59 C70 64 50 64 40 59 Z" />
        <path d="M50 55 C54 50 57 48 60 48 C63 48 66 50 70 55 C64 58 56 58 50 55 Z" />
      </g>
      <circle cx="60" cy="18" r="3.6" fill="#B63C0B" />
    </svg>
  );
}

export function Logo() {
  return (
    <a href="/" className="brand" aria-label="Pulso, inicio">
      <LogoMark />
      <span className="wordmark" aria-hidden="true">
        PULSO
      </span>
    </a>
  );
}
