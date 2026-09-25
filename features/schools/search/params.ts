import { z } from "zod";

import { cleanText, normalizeName } from "../normalize";
import { MAX_PAGE, MAX_QUERY_LENGTH, NETWORK_PARAMS, type NetworkParam, type SearchInput } from "./types";

type Raw = Record<string, string | string[] | undefined>;

/** Arrays (`?q=a&q=b`) valem pelo primeiro valor; qualquer outra coisa vira undefined. */
function first(v: unknown): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === "string" ? s : undefined;
}

const uuid = z.uuid();
const pageSchema = z
  .string()
  .regex(/^\d{1,3}$/)
  .transform(Number)
  .pipe(z.number().int().min(1).max(MAX_PAGE));
const SEARCH_KEYS = ["q", "rede", "bairro", "municipio", "pagina"] as const;

/** Fronteira dos searchParams: nunca lança; entrada inválida vira o padrão. */
export function parseSearchParams(raw: Raw): SearchInput {
  // Corta antes de normalizar: 10 mil caracteres não devem custar CPU.
  const qRaw = cleanText(first(raw.q)?.slice(0, MAX_QUERY_LENGTH * 4)).slice(0, MAX_QUERY_LENGTH).trim();
  const qNormalized = normalizeName(qRaw).slice(0, MAX_QUERY_LENGTH).trim();
  const hasQ = qRaw.length > 0;
  const okQ = qNormalized.length >= 2;
  const inep = /^\d{8}$/.test(qRaw) ? qRaw : null;

  const redeRaw = first(raw.rede)?.trim().toLowerCase();
  const network =
    redeRaw !== undefined && Object.hasOwn(NETWORK_PARAMS, redeRaw) ? NETWORK_PARAMS[redeRaw as NetworkParam] : null;

  const bairroRaw = cleanText(first(raw.bairro)?.slice(0, 400)).slice(0, MAX_QUERY_LENGTH).trim();
  const neighborhood = normalizeName(bairroRaw).length >= 2 ? bairroRaw : null;

  const mun = uuid.safeParse(first(raw.municipio)?.trim());
  const page = pageSchema.safeParse(first(raw.pagina)?.trim());

  return {
    q: okQ ? qRaw : null,
    qNormalized: okQ ? qNormalized : null,
    qTooShort: hasQ && !okQ,
    inep,
    network,
    neighborhood,
    municipalityId: mun.success ? mun.data.toLowerCase() : null,
    page: page.success ? page.data : 1,
    hasRawParams: SEARCH_KEYS.some((k) => raw[k] !== undefined),
  };
}
