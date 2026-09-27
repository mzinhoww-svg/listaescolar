import type { Metadata } from "next";
import localFont from "next/font/local";
import { SITE_LOCALE, SITE_NAME } from "@/lib/seo";
import { siteBase } from "@/lib/site-base";
import "./globals.css";

// D-072 (S19): fonte hospedada localmente (não depende do Google Fonts no build). Arquivo variável (peso
// 500–800, subconjunto latin — o mesmo já usado pelo `next/font/google` anterior), baixado uma vez do próprio
// Google Fonts (licença OFL em `assets/fonts/OFL.txt`).
const plusJakartaSans = localFont({
  src: "../assets/fonts/PlusJakartaSans-latin.woff2",
  variable: "--font-plus-jakarta-sans",
  weight: "500 800",
  style: "normal",
  display: "swap",
});

const base = siteBase();

export const metadata: Metadata = {
  ...(base ? { metadataBase: new URL(base) } : {}),
  title: "ListaCerta",
  description:
    "Plataforma neutra de listas oficiais de material escolar: organiza, compara e redireciona.",
  openGraph: { type: "website", siteName: SITE_NAME, locale: SITE_LOCALE },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${plusJakartaSans.variable} h-full antialiased`}>
      <body className="bg-papel text-tinta flex min-h-full flex-col font-medium">
        <div className="flex flex-1 flex-col">{children}</div>
      </body>
    </html>
  );
}
