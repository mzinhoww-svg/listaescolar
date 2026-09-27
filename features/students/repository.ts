import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { StudentFields } from "./schemas";
import { StudentError, type StudentErrorCode } from "./errors";

// Leitura e escrita SEMPRE com o cliente de SESSÃO (RLS decide: dono só vê/edita o próprio aluno; nenhuma leitura
// de admin/system, mínimo de dado de menor, Ruling 4 do plano da S15). Nada de cliente de serviço aqui.

const HINT_CODES: ReadonlySet<string> = new Set<StudentErrorCode>(["limit"]);

function dbErrorCode(error: { code?: string; hint?: string | null; message: string }): StudentErrorCode {
  if (error.hint && HINT_CODES.has(error.hint)) return error.hint as StudentErrorCode;
  if (error.code === "23514") return "nickname_invalid"; // CHECK do apelido (defesa em profundidade; o Zod já barrou antes)
  if (error.code === "23503") {
    if (/school_id_fkey/.test(error.message)) return "school_not_found";
    if (/grade_id_fkey/.test(error.message)) return "grade_not_found";
    return "invalid_input";
  }
  if (error.code === "42501") return "forbidden";
  return "database";
}

function fail(what: string, error: { message: string; code?: string; hint?: string | null }): never {
  throw new StudentError(`${what}: ${error.message}`, dbErrorCode(error), error.code);
}

const studentRow = z.object({
  id: z.uuid(),
  nickname: z.string(),
  school_id: z.uuid(),
  grade_id: z.uuid(),
  school_year: z.number().int(),
  created_at: z.coerce.date(),
  schools: z.object({ name: z.string(), inep: z.string() }).nullable(),
  grades: z.object({ slug: z.string(), name: z.string() }).nullable(),
});

export type StudentRow = {
  id: string;
  nickname: string;
  schoolId: string;
  schoolName: string | null;
  schoolInep: string | null;
  gradeSlug: string | null;
  gradeLabel: string | null;
  schoolYear: number;
  createdAt: Date;
};

const SELECT_COLUMNS = "id, nickname, school_id, grade_id, school_year, created_at, schools(name, inep), grades(slug, name)";

function mapRow(raw: unknown): StudentRow {
  const r = studentRow.parse(raw);
  return {
    id: r.id,
    nickname: r.nickname,
    schoolId: r.school_id,
    schoolName: r.schools?.name ?? null,
    schoolInep: r.schools?.inep ?? null,
    gradeSlug: r.grades?.slug ?? null,
    gradeLabel: r.grades?.name ?? null,
    schoolYear: r.school_year,
    createdAt: r.created_at,
  };
}

/** Alunos do dono da sessão, mais recentes primeiro. RLS já restringe ao próprio dono. */
export async function listStudents(client: SupabaseClient, ownerId: string): Promise<StudentRow[]> {
  const { data, error } = await client
    .from("students")
    .select(SELECT_COLUMNS)
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });
  if (error) fail("listar alunos", error);
  return (data ?? []).map(mapRow);
}

/** Um aluno do dono; alheio e inexistente são o mesmo `null` (RLS). */
export async function getOwnedStudent(client: SupabaseClient, id: string): Promise<StudentRow | null> {
  const { data, error } = await client.from("students").select(SELECT_COLUMNS).eq("id", id).maybeSingle();
  if (error) fail("ler aluno", error);
  return data ? mapRow(data) : null;
}

async function resolveGradeId(client: SupabaseClient, slug: string): Promise<string> {
  const { data, error } = await client.from("grades").select("id").eq("slug", slug).maybeSingle();
  if (error) fail("ler série", error);
  if (!data) throw new StudentError("série não encontrada", "grade_not_found");
  return z.uuid().parse(data.id);
}

export async function createStudent(client: SupabaseClient, ownerId: string, fields: StudentFields): Promise<string> {
  const gradeId = await resolveGradeId(client, fields.gradeSlug);
  const { data, error } = await client
    .from("students")
    .insert({ owner_id: ownerId, nickname: fields.nickname, school_id: fields.schoolId, grade_id: gradeId, school_year: fields.schoolYear })
    .select("id")
    .single();
  if (error) fail("criar aluno", error);
  return z.uuid().parse(data.id);
}

export async function updateStudent(client: SupabaseClient, id: string, fields: StudentFields): Promise<void> {
  const gradeId = await resolveGradeId(client, fields.gradeSlug);
  const { data, error } = await client
    .from("students")
    .update({ nickname: fields.nickname, school_id: fields.schoolId, grade_id: gradeId, school_year: fields.schoolYear })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) fail("editar aluno", error);
  if (!data) throw new StudentError("aluno não encontrado", "not_found");
}

/** Exclusão real (LGPD): cascade apaga as listas salvas do aluno. `false` quando o aluno já não existe/não é seu. */
export async function deleteStudent(client: SupabaseClient, id: string): Promise<boolean> {
  const { data, error } = await client.from("students").delete().eq("id", id).select("id");
  if (error) fail("apagar aluno", error);
  return (data ?? []).length > 0;
}
