// Kilómetro's mark: a roadside kilometre stone — dark post, green band, "K".
// Drawn in SVG from the brand logo (public/brand/logo.jpg) so it stays crisp.
export function Mark({ size = 28, title }: { size?: number; title?: string }) {
  return (
    <svg
      width={size * 0.8}
      height={size}
      viewBox="0 0 32 40"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      <path d="M3 40V15A13 13 0 0 1 29 15V40Z" fill="var(--ink, #1C1D1F)" />
      <rect x="3" y="14" width="26" height="5" fill="var(--green, #1F7A4D)" />
      <text x="16" y="34" textAnchor="middle" fontFamily="inherit" fontWeight="700" fontSize="13" fill="#FAFAF8">
        K
      </text>
    </svg>
  );
}
