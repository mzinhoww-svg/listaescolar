import Link from "next/link";

import { Logo } from "@/components/brand/Logo";
import { NAV_LINKS } from "@/features/site/copy";

const FOCUS = "focus-visible:outline-verde-fundo focus-visible:outline-2 focus-visible:outline-offset-2";

export function SiteHeader() {
  return (
    <header className="border-linha border-b">
      <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 py-4">
        <Link href="/" aria-label="ListaCerta, página inicial" className={`block w-40 rounded ${FOCUS}`}>
          <Logo variant="horizontal" height={36} priority />
        </Link>
        <nav aria-label="Seções" className="order-3 -mx-6 w-[calc(100%+3rem)] overflow-x-auto px-6 md:order-none md:mx-0 md:w-auto md:overflow-visible md:px-0">
          <ul className="flex gap-1 whitespace-nowrap">
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className={`text-texto-2 hover:text-tinta flex min-h-11 items-center rounded px-3 text-sm font-bold ${FOCUS}`}>
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <Link
          href="/entrar"
          className={`bg-tinta text-papel rounded-botao flex min-h-11 items-center px-5 text-sm font-extrabold ${FOCUS}`}
        >
          Entrar
        </Link>
      </div>
    </header>
  );
}
