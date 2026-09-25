import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { BackIcon } from "@/components/schools/icons";
import { NetworkChips } from "@/components/schools/NetworkChips";
import { SearchResults } from "@/components/schools/SearchResults";
import { parseSearchParams } from "@/features/schools/search/params";
import { buildSearchQuery } from "@/features/schools/search/query";
import { searchSchools } from "@/features/schools/search/repository";
import { buildSearchMetadata } from "@/features/schools/search/seo";
import { NETWORK_PARAMS } from "@/features/schools/search/types";

import { SearchForm } from "./SearchForm";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  return buildSearchMetadata(parseSearchParams(await searchParams));
}

export default async function SearchPage({ searchParams }: Props) {
  const input = parseSearchParams(await searchParams);
  // Falha do banco lança SchoolSearchError: app/escolas/error.tsx (sem vazar a mensagem).
  const result = await searchSchools(input);
  if (result.kind === "redirect") redirect(`/escolas/${result.inep}`);
  if (result.kind === "page_out_of_range") redirect(`/escolas${buildSearchQuery(input, { page: 1 })}`);

  const paramOfNetwork = Object.entries(NETWORK_PARAMS).find(([, v]) => v === input.network)?.[0];
  const preserve: Record<string, string> = {};
  if (paramOfNetwork) preserve.rede = paramOfNetwork;
  if (input.neighborhood) preserve.bairro = input.neighborhood;
  if (input.municipalityId) preserve.municipio = input.municipalityId;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-col gap-4 px-6 pt-14 pb-9">
      <div className="flex items-center gap-3">
        <Link
          href="/"
          aria-label="Voltar ao início"
          className="bg-campo focus-visible:outline-verde-fundo flex size-12 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <BackIcon />
        </Link>
        <h1 className="grow pr-12 text-center text-base font-bold">Buscar escola</h1>
      </div>
      <SearchForm defaultValue={input.q ?? ""} preserve={preserve} />
      <NetworkChips input={input} />
      <SearchResults input={input} result={result} />
    </main>
  );
}
