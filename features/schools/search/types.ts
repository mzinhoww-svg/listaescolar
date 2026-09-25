import type { SchoolNetwork } from "../normalize";

export type VerificationStatus = "registered" | "claimed" | "verified" | "suspended";

/** Valores de `rede` na URL (pt-BR) e o enum do banco. */
export const NETWORK_PARAMS = {
  federal: "federal",
  estadual: "state",
  municipal: "municipal",
  privada: "private",
} as const satisfies Record<string, SchoolNetwork>;

export type NetworkParam = keyof typeof NETWORK_PARAMS;

export const NETWORK_LABEL: Record<SchoolNetwork, string> = {
  federal: "Federal",
  state: "Estadual",
  municipal: "Municipal",
  private: "Privada",
};

export const PAGE_SIZE = 20;
export const MAX_PAGE = 500;
export const MAX_QUERY_LENGTH = 100;

export type SearchInput = {
  /** Texto de exibição (limpo, até 100 caracteres); null quando vazio ou curto demais. */
  q: string | null;
  /** Consulta pronta para o banco (normalizeName); null quando q é null. */
  qNormalized: string | null;
  /** true quando havia texto mas ele foi descartado por ter menos de 2 caracteres normalizados. */
  qTooShort: boolean;
  /** INEP de 8 dígitos digitado em q (candidato a redirecionamento). */
  inep: string | null;
  network: SchoolNetwork | null;
  neighborhood: string | null;
  municipalityId: string | null;
  page: number;
  /** true quando qualquer parâmetro de busca cru veio na URL (mesmo inválido): a página não deve ser indexada. */
  hasRawParams: boolean;
};

export type SchoolListItem = {
  id: string;
  inep: string;
  name: string;
  network: SchoolNetwork;
  neighborhood: string | null;
  municipalityId: string;
  municipalityName: string;
  verificationStatus: VerificationStatus;
  isDemo: boolean;
  rank: number;
};

/** Perfil público: nunca inclui e-mail. */
export type SchoolProfile = {
  id: string;
  inep: string;
  name: string;
  network: SchoolNetwork;
  neighborhood: string | null;
  address: string | null;
  phone: string | null;
  municipalityId: string;
  municipalityName: string;
  uf: string;
  verificationStatus: VerificationStatus;
  isDemo: boolean;
};

export type SearchResult =
  | { kind: "redirect"; inep: string }
  /** `pagina > 1` sem linhas: o banco não devolve total além do fim; a UI trata como página inválida. */
  | { kind: "page_out_of_range"; page: number }
  | { kind: "results"; schools: SchoolListItem[]; total: number; page: number; pageCount: number };
