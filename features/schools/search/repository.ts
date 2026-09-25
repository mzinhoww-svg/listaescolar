import "server-only";

import { z } from "zod";

import { createPublicClient } from "@/lib/supabase/public";

import { PAGE_SIZE, type SchoolListItem, type SchoolProfile, type SearchInput, type SearchResult } from "./types";

/** Subconjunto do cliente Supabase usado aqui (permite injetar nos testes). */
export type PublicClient = ReturnType<typeof createPublicClient>;
export type SearchDeps = { client?: PublicClient };

const network = z.enum(["federal", "state", "municipal", "private"]);
const status = z.enum(["registered", "claimed", "verified", "suspended"]);

const rpcRow = z.object({
  id: z.uuid(),
  inep: z.string(),
  name: z.string(),
  network,
  neighborhood: z.string().nullable(),
  municipality_id: z.uuid(),
  municipality_name: z.string(),
  verification_status: status,
  is_demo: z.boolean(),
  rank: z.number(),
  total_count: z.coerce.number().int().nonnegative(),
});

const profileRow = z.object({
  id: z.uuid(),
  inep: z.string(),
  name: z.string(),
  network,
  neighborhood: z.string().nullable(),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  municipality_id: z.uuid(),
  verification_status: status,
  is_demo: z.boolean(),
  municipalities: z.object({ name: z.string(), uf: z.string() }),
});

/** Erro genérico: a mensagem do banco nunca chega à UI; `code` e `cause` ficam para o servidor. */
export class SchoolSearchError extends Error {
  readonly code: string;
  readonly issues: string[];
  constructor(code: string, options: { cause?: unknown; issues?: string[] } = {}) {
    super("school_search_failed", { cause: options.cause });
    this.name = "SchoolSearchError";
    this.code = code;
    this.issues = options.issues ?? [];
  }
}

/** Registra só código e caminhos/códigos do Zod (sem valores: podem conter PII) e devolve o erro genérico. */
function fail(code: string, cause?: unknown, zod?: z.ZodError): SchoolSearchError {
  const issues = zod?.issues.map((i) => `${i.path.join(".") || "(root)"}:${i.code}`) ?? [];
  console.error("[school-search]", { code, issues });
  return new SchoolSearchError(code, { cause, issues });
}

/** Município padrão sem hardcode: o primeiro habilitado por nome (a RLS só mostra habilitados). */
export async function getDefaultMunicipalityId(deps: SearchDeps = {}): Promise<string | null> {
  const client = deps.client ?? createPublicClient();
  const { data, error } = await client
    .from("municipalities")
    .select("id")
    .eq("is_enabled", true)
    .order("name")
    .order("id")
    .limit(1);
  if (error) throw fail("default_municipality_failed", error);
  return data?.[0]?.id ?? null;
}

export async function getSchoolByInep(inep: string, deps: SearchDeps = {}): Promise<SchoolProfile | null> {
  if (!/^\d{8}$/.test(inep)) return null;
  const client = deps.client ?? createPublicClient();
  // Colunas explícitas: e-mail e CEP nunca são pedidos.
  const { data, error } = await client
    .from("schools")
    .select(
      "id,inep,name,network,neighborhood,address,phone,municipality_id,verification_status,is_demo,municipalities(name,uf)",
    )
    .eq("inep", inep)
    .maybeSingle();
  if (error) throw fail("profile_query_failed", error);
  if (!data) return null;
  const r = profileRow.safeParse(data);
  if (!r.success) throw fail("profile_invalid_shape", r.error, r.error);
  const v = r.data;
  return {
    id: v.id,
    inep: v.inep,
    name: v.name,
    network: v.network,
    neighborhood: v.neighborhood,
    address: v.address,
    phone: v.phone,
    municipalityId: v.municipality_id,
    municipalityName: v.municipalities.name,
    uf: v.municipalities.uf,
    verificationStatus: v.verification_status,
    isDemo: v.is_demo,
  };
}

export async function searchSchools(input: SearchInput, deps: SearchDeps = {}): Promise<SearchResult> {
  const client = deps.client ?? createPublicClient();

  if (input.inep) {
    const hit = await getSchoolByInep(input.inep, { client });
    if (hit) return { kind: "redirect", inep: hit.inep };
  }
  // Texto informado mas curto demais não vira "listar tudo".
  if (input.qTooShort) return { kind: "results", schools: [], total: 0, page: input.page, pageCount: 0 };

  const municipalityId = input.municipalityId ?? (await getDefaultMunicipalityId({ client }));
  const { data, error } = await client.rpc("search_schools", {
    p_query: input.qNormalized,
    p_municipality_id: municipalityId,
    p_network: input.network,
    p_neighborhood: input.neighborhood,
    p_limit: PAGE_SIZE,
    p_offset: (input.page - 1) * PAGE_SIZE,
  });
  if (error) throw fail("search_rpc_failed", error);
  const rows = z.array(rpcRow).safeParse(data ?? []);
  if (!rows.success) throw fail("search_invalid_shape", rows.error, rows.error);

  const schools: SchoolListItem[] = rows.data.map((r) => ({
    id: r.id,
    inep: r.inep,
    name: r.name,
    network: r.network,
    neighborhood: r.neighborhood,
    municipalityId: r.municipality_id,
    municipalityName: r.municipality_name,
    verificationStatus: r.verification_status,
    isDemo: r.is_demo,
    rank: r.rank,
  }));
  if (input.page > 1 && rows.data.length === 0) return { kind: "page_out_of_range", page: input.page };
  // O total vem de qualquer linha (count(*) over ()).
  const total = rows.data[0]?.total_count ?? 0;
  return { kind: "results", schools, total, page: input.page, pageCount: Math.ceil(total / PAGE_SIZE) };
}
