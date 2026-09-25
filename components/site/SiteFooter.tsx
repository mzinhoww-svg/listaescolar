import Link from "next/link";

import { Logo } from "@/components/brand/Logo";

const LINKS = [
  { label: "Privacidade", href: "/privacidade" },
  { label: "Termos", href: "/termos" },
  { label: "Sobre", href: "/sobre" },
];

export function SiteFooter() {
  return (
    <footer className="bg-tinta text-papel">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 px-6 py-10 md:flex-row md:items-center md:justify-between">
        <div className="w-36">
          <Logo variant="horizontal-negativo" height={32} />
        </div>
        <nav aria-label="Rodapé">
          <ul className="flex flex-wrap items-center gap-x-2">
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="focus-visible:outline-verde-certo flex min-h-11 items-center rounded px-2 text-xs font-bold underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  {l.label}
                </Link>
              </li>
            ))}
            <li className="px-2 text-xs font-semibold">Cuiabá · MT</li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
