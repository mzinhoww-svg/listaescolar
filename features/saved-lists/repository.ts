import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { SavedListError, type SavedListErrorCode } from "./errors";

// Mesmo padrão de features/students: cliente de SESSÃO (RLS decide), sem função RPC (o gatilho `saved_lists_guard`
// da 0603 já garante lista publicada + aluno do mesmo dono; ver Ruling 3 do plano da S15).

const HINT_CODES: ReadonlySet<string> = new Set<SavedListErrorCode>(["limit", "list_not_published"]);

function dbErrorCode(error: { code?: string; hint?: string | null }): SavedListErrorCode {
  if (error.hint && HINT_CODES.has(error.hint)) return error.hint as SavedListErrorCode;
  if (error.code === "23505") return "already_saved";
  if (error.code === "23503") return "student_not_found";
  if (error.code === "42501") return "forbidden";
  return "database";
}

function fail(what: string, error: { message: string; code?: string; hint?: string | null }): never {
  throw new SavedListError(`${what}: ${error.message}`, dbErrorCode(error), error.code);
}

const savedListRow = z.object({
  id: z.uuid(),
  created_at: z.coerce.date(),
  student_id: z.uuid(),
  list_id: z.uuid(),
  students: z.object({ nickname: z.string() }).nullable(),
  school_lists: z
    .object({
      school_year: z.number().int(),
      schools: z.object({ name: z.string(), inep: z.string() }).nullable(),
      grades: z.object({ slug: z.string(), name: z.string() }).nullable(),
    })
    .nullable(),
});

export type SavedListRow = {
  id: string;
  createdAt: Date;
  studentId: string;
  listId: string;
  studentNickname: string | null;
  schoolName: string | null;
  schoolInep: string | null;
  gradeSlug: string | null;
  gradeLabel: string | null;
  schoolYear: number | null;
};

const SELECT_COLUMNS =
  "id, created_at, student_id, list_id, students(nickname), school_lists(school_year, schools(name, inep), grades(slug, name))";

function mapRow(raw: unknown): SavedListRow {
  const r = savedListRow.parse(raw);
  return {
    id: r.id,
    createdAt: r.created_at,
    studentId: r.student_id,
    listId: r.list_id,
    studentNickname: r.students?.nickname ?? null,
    schoolName: r.school_lists?.schools?.name ?? null,
    schoolInep: r.school_lists?.schools?.inep ?? null,
    gradeSlug: r.school_lists?.grades?.slug ?? null,
    gradeLabel: r.school_lists?.grades?.name ?? null,
    schoolYear: r.school_lists?.school_year ?? null,
  };
}

/** Listas salvas do dono da sessão, mais recentes primeiro. RLS já restringe ao próprio dono. */
export async function listSavedLists(client: SupabaseClient, ownerId: string): Promise<SavedListRow[]> {
  const { data, error } = await client
    .from("saved_lists")
    .select(SELECT_COLUMNS)
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });
  if (error) fail("listar listas salvas", error);
  return (data ?? []).map(mapRow);
}

export async function saveList(client: SupabaseClient, ownerId: string, studentId: string, listId: string): Promise<string> {
  const { data, error } = await client
    .from("saved_lists")
    .insert({ owner_id: ownerId, student_id: studentId, list_id: listId })
    .select("id")
    .single();
  if (error) fail("salvar lista", error);
  return z.uuid().parse(data.id);
}

/** `false` quando a linha já não existe/não é sua (RLS). */
export async function removeSavedList(client: SupabaseClient, id: string): Promise<boolean> {
  const { data, error } = await client.from("saved_lists").delete().eq("id", id).select("id");
  if (error) fail("remover lista salva", error);
  return (data ?? []).length > 0;
}
