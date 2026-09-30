"use client";
import { Page } from "@/components/Chrome";
import { ClientOnly } from "@/components/ClientOnly";
import { Loading } from "@/components/Loading";
import { StateMessage } from "@/components/StateMessage";

export default function NotFound() {
  return (
    <ClientOnly fallback={<Loading />}>
      <Page>
        <StateMessage
          title="Aquí no hay sendero"
          text="La página que buscas no existe o cambió de lugar."
          action={{ href: "/", label: "Volver al inicio" }}
        />
      </Page>
    </ClientOnly>
  );
}
