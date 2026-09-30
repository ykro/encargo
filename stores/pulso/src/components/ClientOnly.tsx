"use client";
// Renders children only after the browser mounts: the HTML the server sends
// has no product facts at all — only the fallback (a fog-and-contours loading state).
import { useEffect, useState } from "react";

export function ClientOnly({ children, fallback = null }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? <>{children}</> : <>{fallback}</>;
}
