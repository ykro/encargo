"use client";
// Renders children only after the browser mounts: the HTML the server sends
// has no product facts at all. That is what "client-side rendering only" means here.
import { useEffect, useState } from "react";

export function ClientOnly({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? <>{children}</> : null;
}
