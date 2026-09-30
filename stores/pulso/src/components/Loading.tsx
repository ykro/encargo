/**
 * What the server sends and what shows while the page mounts: fog and a few
 * contour rings, no facts. (Static rings on purpose: the server HTML should not
 * even contain numbers that could be mistaken for a price.)
 */
export function Loading() {
  return (
    <div className="loading" role="status" aria-label="Cargando">
      <svg viewBox="0 0 200 120" className="contours shimmer" aria-hidden="true" focusable="false">
        {[20, 34, 48, 62, 76].map((r, i) => (
          <ellipse key={r} cx={100 + i * 3} cy={60 - i * 2} rx={r * 1.2} ry={r * 0.62} />
        ))}
      </svg>
    </div>
  );
}
