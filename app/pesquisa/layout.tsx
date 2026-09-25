import type { ReactNode } from "react";
import type { Viewport } from "next";

/** `viewport-fit=cover` habilita a safe-area do iOS na barra de ações; themeColor pinta o chrome do navegador de Papel. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#F5F2EA",
};

export default function PesquisaLayout({ children }: { children: ReactNode }) {
  return children;
}
