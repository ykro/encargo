"use client";
// A custom visual size picker drawn on a canvas: a person sees sizes and which
// ones are sold out (faded); the DOM contains no sizes and no availability.
import { useEffect, useRef } from "react";

const CELL = 64;

export function SizePicker({
  sizes,
  selected,
  onSelect,
}: {
  sizes: { size: string; available: boolean }[];
  selected: string | null;
  onSelect: (size: string) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const perRow = 6;
  const rows = Math.ceil(sizes.length / perRow);

  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, perRow * CELL, rows * CELL);
    sizes.forEach((s, i) => {
      const x = (i % perRow) * CELL + CELL / 2;
      const y = Math.floor(i / perRow) * CELL + CELL / 2;
      ctx.beginPath();
      ctx.arc(x, y, CELL / 2 - 6, 0, Math.PI * 2);
      ctx.fillStyle = s.size === selected ? "#e5462e" : s.available ? "#111" : "#d8d2c8";
      ctx.fill();
      ctx.fillStyle = s.available ? "#fff" : "#9a9388";
      ctx.font = "600 18px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(s.size, x, y);
    });
  }, [sizes, selected, rows]);

  return (
    <canvas
      ref={ref}
      className="size-picker"
      width={perRow * CELL}
      height={rows * CELL}
      onClick={(e) => {
        const box = e.currentTarget.getBoundingClientRect();
        const col = Math.floor(((e.clientX - box.left) / box.width) * perRow);
        const row = Math.floor(((e.clientY - box.top) / box.height) * rows);
        const s = sizes[row * perRow + col];
        if (s?.available) onSelect(s.size);
      }}
    />
  );
}
