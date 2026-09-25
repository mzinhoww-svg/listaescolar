import { SITE_LOCALE, SITE_NAME } from "@/lib/seo";

import { isFilteredSearch } from "./query";
import { NETWORK_LABEL, type SchoolProfile, type SearchInput } from "./types";

export type PageMetadata = {
  title: string;
  description: string;
  robots: { index: boolean; follow: boolean };
  alternates: { canonical: string };
  openGraph?: { type: "website"; url: string; siteName: string; locale: string; title: string; description: string };
};

/** Indexável só com perfil reivindicado/verificado e não demonstrativo (Ruling: demais são noindex). */
export function isIndexableSchool(s: Pick<SchoolProfile, "verificationStatus" | "isDemo">): boolean {
  return !s.isDemo && (s.verificationStatus === "claimed" || s.verificationStatus === "verified");
}

export function buildSchoolMetadata(school: SchoolProfile): PageMetadata {
  const where = `${school.municipalityName}/${school.uf}`;
  const hood = school.neighborhood ? `, bairro ${school.neighborhood}` : "";
  const demo = school.isDemo;
  const title = demo ? `${school.name} (Demonstração) · ListaCerta` : `${school.name} · ListaCerta`;
  const description = `${demo ? "Demonstração: dados fictícios. " : ""}Perfil da escola ${school.name} (rede ${NETWORK_LABEL[school.network].toLowerCase()}) em ${where}${hood}. Consulte a lista de material escolar quando estiver disponível.`;
  const canonical = `/escolas/${school.inep}`;
  return {
    title,
    description,
    robots: { index: isIndexableSchool(school), follow: school.verificationStatus !== "suspended" },
    alternates: { canonical },
    openGraph: { type: "website", url: canonical, siteName: SITE_NAME, locale: SITE_LOCALE, title, description },
  };
}

/** Busca: indexável só a página 1 sem filtros; canonical sempre `/escolas`. */
export function buildSearchMetadata(input: SearchInput): PageMetadata {
  return {
    title: "Buscar escola · ListaCerta",
    description: "Encontre a escola pelo nome, bairro ou rede e veja a lista de material escolar quando estiver disponível.",
    robots: { index: !isFilteredSearch(input), follow: true },
    alternates: { canonical: "/escolas" },
  };
}
