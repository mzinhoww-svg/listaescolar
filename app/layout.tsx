import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta-sans",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ListaCerta",
  description:
    "Plataforma neutra de listas oficiais de material escolar: organiza, compara e redireciona.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${plusJakartaSans.variable} h-full antialiased`}>
      <body className="bg-papel text-tinta flex min-h-full flex-col font-medium">
        <header className="px-6 py-5 sm:px-10">
          <Link href="/" aria-label="ListaCerta, página inicial" className="inline-block">
            <Logo variant="horizontal" height={36} priority />
          </Link>
        </header>
        <div className="flex flex-1 flex-col">{children}</div>
      </body>
    </html>
  );
}
