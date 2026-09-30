"use client";
// The showcase: big images with the model name and price painted inside them.
// No text, no alt with facts, nothing a machine can read.
import vitrina from "@/vitrina.json";
import { ClientOnly } from "@/components/ClientOnly";
import { Header } from "@/components/Header";

export default function Home() {
  return (
    <ClientOnly>
      <Header />
      <section className="vitrina">
        {vitrina.map((item) => (
          <a key={item.ref} href={`/p/${item.ref}`} aria-label="Ver producto">
            <img src={item.image} alt="" />
          </a>
        ))}
      </section>
    </ClientOnly>
  );
}
