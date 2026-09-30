// Encargo mark: an "E" whose middle bar ends in a check — the errand, verified.
// Vector redraw of public/brand/logo.jpg (direction B · Tablero).
export function LogoMark({ size = 32, title }: { size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <rect width="64" height="64" rx="6" fill="var(--cobalt)" />
      <path d="M17 14h30v9H26v5h13v8H26v5h21v9H17z" fill="var(--surface)" />
      <path d="M36 33.5l4.5 4.5L50 28" fill="none" stroke="var(--cobalt)" strokeWidth="7" strokeLinecap="square" />
      <path d="M36 33.5l4.5 4.5L50 28" fill="none" stroke="var(--surface)" strokeWidth="3.2" strokeLinecap="square" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`wordmark ${className ?? ""}`}>
      <LogoMark size={28} />
      <span>ENCARGO</span>
    </span>
  );
}
