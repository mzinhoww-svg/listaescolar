import type { Metadata } from "next";
import type { ReactNode } from "react";

// Cotações são privadas: nunca indexar.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function CotacaoLayout({ children }: { children: ReactNode }) {
  return children;
}
