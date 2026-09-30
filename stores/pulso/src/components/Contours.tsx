"use client";
import { useEffect, useRef } from "react";

// Decorative topographic contour lines (deterministic, so server and client agree).
// With `draw`, each line traces itself slowly — the brand's signature motion.

function rand(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0) / 4294967296);
}

function loop(cx: number, cy: number, r: number, wobble: number[], squash: number): string {
  const n = wobble.length;
  const pts = wobble.map((w, i) => {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (1 + w);
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * squash];
  });
  // Closed Catmull-Rom spline → cubic Béziers for smooth organic lines.
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return `${d} Z`;
}

/**
 * Painted on a canvas, not as SVG paths: decorative lines should not leave
 * thousands of coordinates (some of which look like prices) in the DOM.
 */
export function Contours({
  seed = 7,
  lines = 7,
  draw = false,
  className = "",
  squash = 0.72,
}: {
  seed?: number;
  lines?: number;
  draw?: boolean;
  className?: string;
  squash?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = ref.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const r = rand(seed);
    const base = Array.from({ length: 10 }, () => r() * 0.28 - 0.14);
    const paths = Array.from({ length: lines }, (_, i) => {
      const t = (i + 1) / lines;
      const wobble = base.map((b) => b * (0.4 + t) + (r() - 0.5) * 0.05);
      return new Path2D(loop(200 + (1 - t) * 18, 150 - (1 - t) * 10, 18 + t * 170, wobble, squash));
    });
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    const started = performance.now();
    const paint = (now: number) => {
      const box = el.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      if (el.width !== Math.round(box.width * dpr)) {
        el.width = Math.round(box.width * dpr);
        el.height = Math.round(box.height * dpr);
      }
      const scale = Math.min(el.width / 400, el.height / 300);
      ctx.setTransform(scale, 0, 0, scale, (el.width - 400 * scale) / 2, (el.height - 300 * scale) / 2);
      ctx.clearRect(-1000, -1000, 3000, 3000);
      ctx.strokeStyle = "#7C8C74";
      ctx.lineWidth = dpr / scale;
      paths.forEach((path, i) => {
        const p = !draw || reduced ? 1 : Math.min(1, Math.max(0, (now - started - i * 250) / 5500));
        const eased = 1 - Math.pow(1 - p, 4);
        ctx.setLineDash(eased >= 1 ? [] : [eased * 2400, 2400]);
        ctx.stroke(path);
      });
      if (draw && !reduced && now - started < 5500 + lines * 250) frame = requestAnimationFrame(paint);
    };
    frame = requestAnimationFrame(paint);
    const ro = new ResizeObserver(() => requestAnimationFrame(paint));
    ro.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, [seed, lines, draw, squash]);
  return <canvas ref={ref} className={`contours ${className}`} aria-hidden="true" />;
}
