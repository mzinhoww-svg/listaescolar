import type { Metadata } from "next";
import Link from "next/link";

import { Logo } from "@/components/brand/Logo";
import { MagnifierIcon, PersonIcon } from "@/components/schools/icons";

import { SearchForm } from "./escolas/SearchForm";

export const metadata: Metadata = {
  title: "ListaCerta · Lista de material escolar",
  description: "Encontre a escola pelo nome ou INEP e veja a lista de material escolar quando estiver disponível.",
  alternates: { canonical: "/" },
};

const CHIPS = [
  { label: "Municipal", rede: "municipal" },
  { label: "Estadual", rede: "estadual" },
  { label: "Federal", rede: "federal" },
  { label: "Privada", rede: "privada" },
];

const SHORTCUTS = [
  { label: "Ver todas as escolas", href: "/escolas", note: "Lista completa, com filtro por rede", icon: <MagnifierIcon size={20} /> },
  { label: "Minha conta", href: "/conta", note: "Entre para acompanhar suas listas", icon: <PersonIcon /> },
];

/** App03 (mobile): busca primeiro. Sem contagens nem escolas em destaque sem dado real. */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-1 flex-col gap-5 px-6 pt-14 pb-9">
      <Logo variant="horizontal" height={40} priority />
      <h1 className="text-[32px] leading-[1.05] font-extrabold tracking-[-0.035em]">
        Encontre a lista de material da sua escola
      </h1>
      <p className="text-texto-2 text-[15px] leading-[1.4] font-medium">
        Busque pelo nome ou pelo INEP. Quando a escola tiver lista publicada, ela aparece no perfil.
      </p>
      <SearchForm />
      <nav aria-label="Buscar por rede" className="-mx-6 overflow-x-auto px-6">
        <ul className="flex gap-2">
          {CHIPS.map((c) => (
            <li key={c.rede}>
              <Link
                href={`/escolas?rede=${c.rede}`}
                className="bg-campo text-tinta rounded-botao focus-visible:outline-verde-fundo block px-4 py-2.5 text-[13px] font-semibold whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                {c.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <section aria-labelledby="atalhos" className="flex flex-col gap-2.5">
        <h2 id="atalhos" className="text-base font-extrabold">
          Atalhos
        </h2>
        <ul className="flex flex-col gap-2.5">
          {SHORTCUTS.map((s) => (
            <li key={s.href}>
              <Link
                href={s.href}
                className="focus-visible:outline-verde-fundo flex items-center gap-3 rounded-[22px] bg-white p-3.5 focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <span aria-hidden className="bg-campo text-tinta flex size-[52px] shrink-0 items-center justify-center rounded-2xl">
                  {s.icon}
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-[15px] font-extrabold">{s.label}</span>
                  <span className="text-texto-3 text-xs font-medium">{s.note}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
