"use client";
// The size picker is an elevation line: sizes sit along a contour arc drawn on
// a canvas. A person sees every size and which ones are gone (faded); the DOM
// holds no size and no availability — that is the opacity, by design.
// Keyboard: Tab to focus, ←/→ to walk the line, Enter/Space to choose.
import { useCallback, useEffect, useRef, useState } from "react";

type Size = { size: string; available: boolean };

const COLORS = { ink: "#1B2226", muted: "#4F5B61", sage: "#7C8C74", ember: "#B63C0B", faded: "rgba(79,91,97,0.38)" };
const SPAN = (140 * Math.PI) / 180; // arc width
const LABEL_INSET = 30;

function geometry(w: number, count: number) {
  const r = Math.min(w * 0.46, 250);
  const cx = w / 2;
  const cy = r + 24; // room for the selected dot above the line
  const start = -Math.PI / 2 - SPAN / 2;
  const angle = (i: number) => (count === 1 ? -Math.PI / 2 : start + (SPAN * i) / (count - 1));
  // The lowest labels sit at the ends of the arc; the canvas ends just below them.
  const height = Math.ceil(cy + Math.sin(start) * (r - LABEL_INSET) + 24);
  return { r, cx, cy, angle, height };
}

export function SizePicker({
  sizes,
  selected,
  onSelect,
}: {
  sizes: Size[];
  selected: string | null;
  onSelect: (size: string) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const [announce, setAnnounce] = useState("");
  const height = width ? geometry(width, sizes.length).height : 180;

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.min(entry.contentRect.width, 560)));
    ro.observe(el.parentElement!);
    return () => ro.disconnect();
  }, []);

  const draw = useCallback(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx || !width) return;
    const dpr = window.devicePixelRatio || 1;
    el.width = Math.round(width * dpr);
    el.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const { r, cx, cy, angle } = geometry(width, sizes.length);
    const family = getComputedStyle(el).fontFamily;

    // Contour lines: the picker's own terrain.
    ctx.lineWidth = 1;
    for (const [offset, alpha] of [[-22, 0.35], [0, 0.95], [16, 0.45], [30, 0.2]] as const) {
      ctx.beginPath();
      ctx.strokeStyle = `rgba(124,140,116,${alpha})`;
      ctx.arc(cx, cy, r + offset, -Math.PI / 2 - SPAN / 2 - 0.08, -Math.PI / 2 + SPAN / 2 + 0.08);
      ctx.stroke();
    }

    sizes.forEach((s, i) => {
      const a = angle(i);
      const isSel = s.size === selected;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      // Tick across the line.
      ctx.beginPath();
      ctx.strokeStyle = s.available ? COLORS.sage : COLORS.faded;
      ctx.lineWidth = 1.5;
      ctx.moveTo(cx + Math.cos(a) * (r - 7), cy + Math.sin(a) * (r - 7));
      ctx.lineTo(cx + Math.cos(a) * (r + 7), cy + Math.sin(a) * (r + 7));
      ctx.stroke();
      if (isSel) {
        ctx.beginPath();
        ctx.fillStyle = COLORS.ember;
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.fill();
      }
      // Label below the line, rotated with it.
      const lr = r - LABEL_INSET;
      ctx.save();
      ctx.translate(cx + Math.cos(a) * lr, cy + Math.sin(a) * lr);
      ctx.rotate(a + Math.PI / 2);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `${isSel ? 700 : 500} ${s.size.includes(".") ? 14 : 17}px ${family}`;
      ctx.fillStyle = isSel ? COLORS.ember : s.available ? COLORS.ink : COLORS.faded;
      ctx.fillText(s.size, 0, 0);
      if (!s.available) {
        const tw = ctx.measureText(s.size).width;
        ctx.strokeStyle = COLORS.faded;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-tw / 2 - 3, 6);
        ctx.lineTo(tw / 2 + 3, -6);
        ctx.stroke();
      }
      ctx.restore();
      if (focusIndex === i) {
        ctx.beginPath();
        ctx.strokeStyle = COLORS.ember;
        ctx.lineWidth = 2;
        ctx.arc(cx + Math.cos(a) * (r - LABEL_INSET), cy + Math.sin(a) * (r - LABEL_INSET), 17, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
  }, [width, height, sizes, selected, focusIndex]);

  useEffect(() => {
    draw();
    document.fonts?.ready.then(draw);
  }, [draw]);

  const describe = (s: Size, chosen = false) =>
    chosen ? `Talla ${s.size} elegida` : `Talla ${s.size}, ${s.available ? "disponible" : "agotada"}`;

  const choose = (i: number) => {
    const s = sizes[i];
    setFocusIndex(i);
    if (!s.available) {
      setAnnounce(describe(s));
      return;
    }
    onSelect(s.size);
    setAnnounce(describe(s, true));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const current = focusIndex ?? Math.max(0, sizes.findIndex((s) => s.size === selected));
    let next = current;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") next = Math.min(sizes.length - 1, current + 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = Math.max(0, current - 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = sizes.length - 1;
    else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose(current);
      return;
    } else return;
    e.preventDefault();
    setFocusIndex(next);
    setAnnounce(describe(sizes[next]));
  };

  const onPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * width;
    const py = ((e.clientY - box.top) / box.height) * height;
    const { cx, cy, angle } = geometry(width, sizes.length);
    const a = Math.atan2(py - cy, px - cx);
    let best = 0;
    sizes.forEach((_, i) => {
      if (Math.abs(angle(i) - a) < Math.abs(angle(best) - a)) best = i;
    });
    choose(best);
  };

  return (
    <div className="picker">
      <p className="picker-label" id="picker-label">
        Elige tu talla (US)
      </p>
      <canvas
        ref={canvas}
        className="picker-canvas"
        style={{ height, width: width || "100%" }}
        tabIndex={0}
        role="group"
        aria-labelledby="picker-label"
        aria-describedby="picker-help"
        onKeyDown={onKeyDown}
        onPointerUp={onPointer}
        onBlur={() => setFocusIndex(null)}
      />
      <span id="picker-help" className="sr-only">
        Usa las flechas para recorrer la curva y Enter para elegir.
      </span>
      <span className="sr-only" aria-live="polite">
        {announce}
      </span>
    </div>
  );
}
