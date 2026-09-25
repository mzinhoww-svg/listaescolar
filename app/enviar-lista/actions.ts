"use server";

import { redirect } from "next/navigation";

import { getSessionActor } from "@/features/auth/actor";
import { requireAccess } from "@/features/auth/guard";
import { listMySchools } from "@/features/claims/queries-mine";
import { resolveSchoolChoice } from "@/features/submissions/school-choice";
import { createPublicClient } from "@/lib/supabase/public";
import { messageFor, type FormErrorCode } from "@/features/submissions/copy";
import { buildSubmitDeps } from "@/features/submissions/deps";
import { checkUploadSize } from "@/features/submissions/file-validation";
import { submitFieldsSchema, type SubmitState } from "@/features/submissions/form-schema";
import { SubmissionError, submitList } from "@/features/submissions/service";

const fail = (code: FormErrorCode): SubmitState => ({ status: "error", code, message: messageFor(code) });

/** A escola existe e é visível ao público (município habilitado: RLS de `schools`). */
async function isPublicSchool(id: string): Promise<boolean> {
  const { data, error } = await createPublicClient().from("schools").select("id").eq("id", id).maybeSingle();
  return !error && data !== null;
}

/**
 * Envio de lista. Ordem: sessão e papel (`requireAccess`, nunca metadata) → consentimento → tamanho do arquivo
 * (antes de ler o conteúdo) → `submitList`, que grava com o cliente de serviço. Qualquer desfecho leva ao painel do envio.
 */
export async function submitListAction(_prev: SubmitState, formData: FormData): Promise<SubmitState> {
  const { user, role } = await requireAccess("/enviar-lista");

  if (formData.get("consent") !== "on") return fail("consent_required");
  const schoolRaw = formData.get("schoolId");
  const fields = submitFieldsSchema.safeParse({
    grade: formData.get("grade"),
    schoolYear: formData.get("schoolYear"),
    schoolId: typeof schoolRaw === "string" && schoolRaw !== "" ? schoolRaw : undefined,
  });
  if (!fields.success) return fail("invalid_input");
  // D-002: envio da escola só de escola VINCULADA ao remetente (o banco confere de novo); a família escolhe qualquer escola pública.
  const actor = await getSessionActor();
  if (!actor) return fail("forbidden");
  const linked = role === "parent" ? [] : (await listMySchools(actor).catch(() => [])).map((s) => s.schoolId);
  const choice = resolveSchoolChoice({ role, schoolId: fields.data.schoolId, linkedSchoolIds: linked });
  if (!choice.ok) return fail(choice.code);
  if (choice.source === "parent" && choice.schoolId && !(await isPublicSchool(choice.schoolId))) return fail("invalid_input");

  // Os dois campos de arquivo (foto e galeria) usam o mesmo nome; o vazio chega como um File de 0 bytes
  // (o Next o nomeia "blob"). Vale o que tem conteúdo; só sem nenhum, um arquivo nomeado de 0 bytes é "vazio".
  const files = formData.getAll("file").filter((f): f is File => f instanceof File);
  const file = files.find((f) => f.size > 0) ?? files.find((f) => f.name !== "" && f.name !== "blob");
  if (!file) return fail("no_file");
  const tooBig = checkUploadSize(file.size);
  if (tooBig && !tooBig.ok) return fail(tooBig.code);

  let submissionId: string;
  try {
    const result = await submitList(
      {
        profileId: user.id,
        source: choice.source,
        ...(choice.schoolId ? { schoolId: choice.schoolId } : {}),
        grade: fields.data.grade,
        schoolYear: fields.data.schoolYear,
        consent: true,
        file: {
          name: file.name,
          declaredMime: file.type,
          size: file.size,
          bytes: new Uint8Array(await file.arrayBuffer()),
        },
      },
      buildSubmitDeps(),
    );
    submissionId = result.submissionId;
  } catch (e) {
    if (e instanceof SubmissionError) return fail(e.code);
    return fail("unexpected");
  }
  redirect(`/enviar-lista/${submissionId}`);
}
