"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSessionActor, type SessionActor } from "@/features/auth/actor";
import { StudentError } from "@/features/students/errors";
import type { StudentActionResult } from "@/features/students/form-state";
import { studentErrorMessage } from "@/features/students/messages";
import { createStudent, deleteStudent, updateStudent } from "@/features/students/repository";
import { studentFieldsSchema, studentIdSchema } from "@/features/students/schemas";
import { createClient } from "@/lib/supabase/server";

const HUB_PATH = "/conta";

async function actorOrLogin(next: string): Promise<SessionActor> {
  const actor = await getSessionActor();
  if (!actor) redirect(`/entrar?next=${encodeURIComponent(next)}`);
  return actor;
}

function fieldsFromForm(formData: FormData) {
  return {
    nickname: formData.get("nickname"),
    gradeSlug: formData.get("gradeSlug"),
  };
}

function dbErrorMessage(e: unknown): string {
  return e instanceof StudentError ? studentErrorMessage(e.code) : studentErrorMessage("database");
}

/** App13 "Novo aluno": só apelido e série (SPEC §5); consentimento explícito antes de gravar. */
export async function createStudentAction(_prev: StudentActionResult, formData: FormData): Promise<StudentActionResult> {
  const actor = await actorOrLogin("/conta/alunos/novo");
  if (formData.get("consent") !== "on") return { status: "error", message: "Marque o consentimento para salvar o aluno." };
  const parsed = studentFieldsSchema.safeParse(fieldsFromForm(formData));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Confira os dados do aluno." };
  try {
    await createStudent(await createClient(), actor.userId, parsed.data);
  } catch (e) {
    return { status: "error", message: dbErrorMessage(e) };
  }
  revalidatePath(HUB_PATH);
  redirect(HUB_PATH);
}

/** `id` vem de um campo oculto do formulário (não de rota), para caber no contrato de 2 argumentos do useActionState. */
export async function updateStudentAction(_prev: StudentActionResult, formData: FormData): Promise<StudentActionResult> {
  const idParsed = studentIdSchema.safeParse(formData.get("id"));
  if (!idParsed.success) return { status: "error", message: studentErrorMessage("not_found") };
  await actorOrLogin(`/conta/alunos/${idParsed.data}/editar`);
  const parsed = studentFieldsSchema.safeParse(fieldsFromForm(formData));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Confira os dados do aluno." };
  try {
    await updateStudent(await createClient(), idParsed.data, parsed.data);
  } catch (e) {
    return { status: "error", message: dbErrorMessage(e) };
  }
  revalidatePath(HUB_PATH);
  redirect(HUB_PATH);
}

/** Exclusão real (LGPD): cascade apaga as listas salvas do aluno. */
export async function deleteStudentAction(formData: FormData): Promise<void> {
  await actorOrLogin(HUB_PATH);
  const id = studentIdSchema.safeParse(formData.get("id"));
  if (!id.success) return;
  await deleteStudent(await createClient(), id.data).catch(() => false);
  revalidatePath(HUB_PATH);
  redirect(HUB_PATH);
}
