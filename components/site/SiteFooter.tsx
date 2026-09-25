import Link from "next/link";

import { Logo } from "@/components/brand/Logo";

const LINKS = [
  { label: "Privacidade", href: "/privacidade" },
  { label: "Termos", href: "/termos" },
  { label: "Sobre", href: "/sobre" },
];

export function SiteFooter() {
  return (
    <footer className="border-linha border-t">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 px-6 py-8 md:flex-row md:items-center md:justify-between">
        <div className="w-36">
          <Logo variant="horizontal" height={32} />
        </div>
        <nav aria-label="Rodapé">
          <ul className="flex flex-wrap gap-x-2">
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="text-texto-2 focus-visible:outline-verde-fundo flex min-h-11 items-center rounded px-2 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <p className="text-texto-3 text-sm font-semibold">Cuiabá · MT</p>
      </div>
    </footer>
  );
}
