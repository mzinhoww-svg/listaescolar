import "server-only";

import { z } from "zod";

import { createPublicClient } from "@/lib/supabase/public";

import type {
  PublicList,
  PublicListItem,
  PublicListVersion,
  PublicListVersionSummary,
} from "./types";

/** Só o cliente publicável (RLS + grants por coluna). Nunca service role neste arquivo. */
export type PublicClient = ReturnType<typeof createPublicClient>;
export type ListQueryDeps = { client?: PublicClient };
/** `listId` (já obtido de getPublishedList) evita reconsultar a lista e a corrida entre a versão atual e a exibida. */
export type HistoryDeps = ListQueryDeps & { listId?: string };

// Colunas explícitas e seguras: `select *` em list_items dá 42501 para anon.
const LIST_COLUMNS = "id, school_year, published_at, is_demo, current_version_id";
const VERSION_COLUMNS = "id, version_number, status, published_at, item_count";
const ITEM_COLUMNS = "id, position, original_name, normalized_name, category, quantity, unit";

const listRow = z.object({
  id: z.uuid(),
  school_year: z.number().int(),
  published_at: z.string(),
  is_demo: z.boolean(),
  current_version_id: z.uuid().nullable().optional(),
});
const versionRow = z.object({
  id: z.uuid(),
  version_number: z.number().int().positive(),
  status: z.enum(["published", "superseded"]),
  published_at: z.string(),
  item_count: z.number().int().nonnegative(),
});
const itemRow = z.object({
  id: z.uuid(),
  position: z.number().int().positive(),
  original_name: z.string(),
  normalized_name: z.string(),
  category: z.string().nullable(),
  quantity: z.coerce.number().nullable(),
  unit: z.string().nullable(),
});

/** Zod remove chaves desconhecidas: qualquer coluna interna que vier na linha é descartada aqui. */
export function toPublicVersionSummary(row: unknown): PublicListVersionSummary {
  const v = versionRow.parse(row);
  return {
    id: v.id,
    versionNumber: v.version_number,
    status: v.status,
    publishedAt: v.published_at,
    itemCount: v.item_count,
  };
}

export function toPublicList(
  list: unknown,
  version: unknown,
  items: unknown[],
  gradeSlug: string,
): PublicList {
  const l = listRow.parse(list);
  const rows = items.map((i) => itemRow.parse(i));
  const publicItems: PublicListItem[] = rows.map((i) => ({
    id: i.id,
    position: i.position,
    name: i.original_name,
    normalizedName: i.normalized_name,
    category: i.category,
    quantity: i.quantity === null ? null : Number(i.quantity),
    unit: i.unit,
  }));
  const v: PublicListVersion = { ...toPublicVersionSummary(version), items: publicItems };
  return {
    id: l.id,
    gradeSlug,
    schoolYear: l.school_year,
    publishedAt: l.published_at,
    isDemo: l.is_demo,
    version: v,
  };
}

async function findPublishedListRow(
  client: PublicClient,
  inep: string,
  gradeSlug: string,
  year: number,
) {
  const { data: school, error: e1 } = await client
    .from("schools")
    .select("id")
    .eq("inep", inep)
    .maybeSingle();
  if (e1) throw new Error(`lists: consulta de escola falhou (${e1.code})`);
  if (!school) return null;
  const { data: grade, error: e2 } = await client
    .from("grades")
    .select("id")
    .eq("slug", gradeSlug)
    .maybeSingle();
  if (e2) throw new Error(`lists: consulta de série falhou (${e2.code})`);
  if (!grade) return null;
  const { data, error } = await client
    .from("school_lists")
    .select(LIST_COLUMNS)
    .eq("school_id", school.id)
    .eq("grade_id", grade.id)
    .eq("school_year", year)
    .eq("status", "published")
    .maybeSingle();
  if (error) throw new Error(`lists: consulta de lista falhou (${error.code})`);
  return data ?? null;
}

/** Lista publicada (versão atual com itens) de uma escola/série/ano, ou null. Nada além da publicada. */
export async function getPublishedList(
  inep: string,
  gradeSlug: string,
  year: number,
  deps: ListQueryDeps = {},
): Promise<PublicList | null> {
  const client = deps.client ?? createPublicClient();
  const list = await findPublishedListRow(client, inep, gradeSlug, year);
  if (!list?.current_version_id) return null;
  const { data: version, error: ve } = await client
    .from("list_versions")
    .select(VERSION_COLUMNS)
    .eq("id", list.current_version_id)
    .eq("status", "published")
    .maybeSingle();
  if (ve) throw new Error(`lists: consulta de versão falhou (${ve.code})`);
  if (!version) return null;
  const { data: items, error: ie } = await client
    .from("list_items")
    .select(ITEM_COLUMNS)
    .eq("version_id", version.id)
    .order("position", { ascending: true });
  if (ie) throw new Error(`lists: consulta de itens falhou (${ie.code})`);
  return toPublicList(list, version, items ?? [], gradeSlug);
}

/** Histórico público (published/superseded, mais nova primeiro) de uma lista publicada; vazio se não publicada. */
export async function listVersionHistory(
  inep: string,
  gradeSlug: string,
  year: number,
  deps: HistoryDeps = {},
): Promise<PublicListVersionSummary[]> {
  const client = deps.client ?? createPublicClient();
  let listId = deps.listId;
  if (!listId) {
    const list = await findPublishedListRow(client, inep, gradeSlug, year);
    if (!list) return [];
    listId = list.id;
  }
  const { data, error } = await client
    .from("list_versions")
    .select(VERSION_COLUMNS)
    .eq("list_id", listId)
    .in("status", ["published", "superseded"])
    .order("version_number", { ascending: false });
  if (error) throw new Error(`lists: consulta de histórico falhou (${error.code})`);
  return (data ?? []).map((r) => toPublicVersionSummary(r));
}

export type PublishedGradeYear = { gradeSlug: string; year: number };

/** Séries/anos com lista publicada de uma escola (dado real, para os atalhos da página da escola). Vazio se nenhuma. */
export async function listPublishedGradeYears(inep: string, deps: ListQueryDeps = {}): Promise<PublishedGradeYear[]> {
  const client = deps.client ?? createPublicClient();
  const { data: school, error: e1 } = await client.from("schools").select("id").eq("inep", inep).maybeSingle();
  if (e1) throw new Error(`lists: consulta de escola falhou (${e1.code})`);
  if (!school) return [];
  const { data: lists, error: e2 } = await client
    .from("school_lists")
    .select("grade_id, school_year, current_version_id")
    .eq("school_id", school.id)
    .eq("status", "published");
  if (e2) throw new Error(`lists: consulta de listas falhou (${e2.code})`);
  const rows = (lists ?? []).filter((r) => r.current_version_id);
  if (rows.length === 0) return [];
  const { data: grades, error: e3 } = await client.from("grades").select("id, slug");
  if (e3) throw new Error(`lists: consulta de séries falhou (${e3.code})`);
  const slugById = new Map((grades ?? []).map((g) => [g.id as string, g.slug as string]));
  const out: PublishedGradeYear[] = [];
  for (const r of rows) {
    const slug = slugById.get(r.grade_id as string);
    if (slug) out.push({ gradeSlug: slug, year: Number(r.school_year) });
  }
  return out;
}

export type ListOrigin = { inep: string; gradeSlug: string; year: number };

/** Escola, série e ano de uma versão publicada (para "voltar à lista"). Versão inexistente, não pública ou cópia privada → null. */
export async function getListOriginByVersion(versionId: string, deps: ListQueryDeps = {}): Promise<ListOrigin | null> {
  const client = deps.client ?? createPublicClient();
  const { data: version, error: e1 } = await client
    .from("list_versions")
    .select("list_id")
    .eq("id", versionId)
    .in("status", ["published", "superseded"])
    .maybeSingle();
  if (e1) throw new Error(`lists: consulta de versão falhou (${e1.code})`);
  if (!version) return null;
  const { data: list, error: e2 } = await client
    .from("school_lists")
    .select("school_id, grade_id, school_year")
    .eq("id", version.list_id)
    .maybeSingle();
  if (e2) throw new Error(`lists: consulta de lista falhou (${e2.code})`);
  if (!list) return null;
  const [school, grade] = await Promise.all([
    client.from("schools").select("inep").eq("id", list.school_id).maybeSingle(),
    client.from("grades").select("slug").eq("id", list.grade_id).maybeSingle(),
  ]);
  if (school.error || grade.error || !school.data || !grade.data) return null;
  return { inep: String(school.data.inep), gradeSlug: String(grade.data.slug), year: Number(list.school_year) };
}

/** Caminho da página da lista de origem, ou null quando não há como resolvê-la. */
export function listOriginHref(origin: ListOrigin | null): string | null {
  return origin ? `/escolas/${origin.inep}/${origin.gradeSlug}?ano=${origin.year}` : null;
}
