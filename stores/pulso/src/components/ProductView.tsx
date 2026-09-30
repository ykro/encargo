"use client";
import { useState } from "react";
import vitrina from "@/vitrina.json";
import { ClientOnly } from "./ClientOnly";
import { Header } from "./Header";
import { SizePicker } from "./SizePicker";

export function ProductView({ slug }: { slug: string }) {
  const item = vitrina.find((v) => v.ref === slug);
  const [size, setSize] = useState<string | null>(null);
  return (
    <ClientOnly>
      <Header />
      {item ? (
        <section className="hero">
          <img src={item.image} alt="" />
          <SizePicker sizes={item.sizes} selected={size} onSelect={setSize} />
          <button
            className="cta"
            disabled={!size}
            onClick={() => (window.location.href = `/checkout?ref=${item.ref}&t=${size}`)}
          >
            Lo quiero
          </button>
        </section>
      ) : (
        <p className="hero">Este producto ya no está disponible.</p>
      )}
    </ClientOnly>
  );
}
