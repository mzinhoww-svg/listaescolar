import type { ReactNode } from "react";
import type { Viewport } from "next";

/**
 * `viewport-fit=cover` habilita a safe-area do iOS na barra de ações; themeColor pinta o
 * chrome do navegador de Papel. O wrapper tinge as superfícies do navegador que o design
 * não desenha (seleção de texto, cursor de texto, checkbox nativo) com a paleta da marca.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#F5F2EA",
};

export default function PesquisaLayout({ children }: { children: ReactNode }) {
  return (
    <div className="selection:bg-verde-certo/40 selection:text-tinta caret-verde-fundo accent-verde-fundo flex flex-1 flex-col">
      {children}
    </div>
  );
}
