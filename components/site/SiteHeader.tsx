import Link from "next/link";

import { Logo } from "@/components/brand/Logo";
import { NAV_LINKS } from "@/features/site/copy";

const FOCUS = "focus-visible:outline-verde-fundo focus-visible:outline-2 focus-visible:outline-offset-2";

export function SiteHeader() {
  return (
    <header className="bg-papel">
      <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center gap-x-4 gap-y-1 px-6 py-4">
        <Link href="/" aria-label="ListaCerta, página inicial" className={`order-1 block w-40 rounded ${FOCUS}`}>
          <Logo variant="horizontal" height={36} priority />
        </Link>
        <nav aria-label="Seções" className="order-3 w-full overflow-x-auto md:order-2 md:ml-auto md:w-auto md:overflow-visible">
          <ul className="flex gap-1 whitespace-nowrap">
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className={`text-tinta flex min-h-11 items-center rounded px-3 text-[13px] font-bold ${FOCUS}`}>
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <Link
          href="/entrar"
          className={`border-tinta text-tinta rounded-botao order-2 ml-auto flex min-h-11 items-center border-[1.5px] px-5 text-[13px] font-extrabold md:order-3 md:ml-0 ${FOCUS}`}
        >
          Entrar
        </Link>
      </div>
    </header>
  );
}
