import Link from "next/link";

import { SearchForm } from "@/app/escolas/SearchForm";
import { SITE_COPY } from "@/features/site/copy";

import { HeroListCard } from "./HeroListCard";

const CHIPS = [
  { label: "Municipal", rede: "municipal" },
  { label: "Estadual", rede: "estadual" },
  { label: "Federal", rede: "federal" },
  { label: "Privada", rede: "privada" },
];

export function Hero() {
  const c = SITE_COPY.hero;
  return (
    <section aria-labelledby="hero-t" className="bg-papel"><div className="mx-auto grid w-full max-w-[1200px] grid-cols-1 items-center gap-10 px-6 py-12 md:grid-cols-2 md:gap-16 md:py-20">
      <div className="flex min-w-0 flex-col gap-5">
        <p className="text-verde-fundo text-xs font-extrabold tracking-[0.14em] uppercase">{c.eyebrow}</p>
        <h1 id="hero-t" className="text-[34px] leading-[1.05] font-extrabold tracking-[-0.035em] md:text-[56px]">
          {c.title}
        </h1>
        <p className="text-texto-2 text-base leading-relaxed font-medium md:text-lg">{c.lead}</p>
        <SearchForm showNeighborhood={false} submitLabel="Buscar a escola do meu filho" />
        <nav aria-label="Buscar por rede" className="-mx-6 overflow-x-auto px-6 md:mx-0 md:px-0">
          <ul className="flex gap-2">
            {CHIPS.map((ch) => (
              <li key={ch.rede}>
                <Link
                  href={`/escolas?rede=${ch.rede}`}
                  className="bg-campo text-tinta rounded-botao focus-visible:outline-verde-fundo flex min-h-11 items-center px-4 text-[13px] font-semibold whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  {ch.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <Link
          href="/escolas"
          className="text-tinta border-tinta rounded-botao focus-visible:outline-verde-fundo flex min-h-11 w-fit items-center border-[1.5px] px-5 text-sm font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {c.schoolCta}
        </Link>
      </div>
      <HeroListCard />
    </div></section>
  );
}
