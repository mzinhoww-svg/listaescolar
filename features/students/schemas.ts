import { z } from "zod";

import { academicYears, findGrade } from "@/features/grades/catalog";

export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 30;

/**
 * Só apelido: nunca sobrenome (regra de produto, SPEC §5). O espaço é o sinal prático de "nome e sobrenome" — a
 * mesma regra do CHECK do banco (`student_nickname_valid`, 0603), na mesma ordem, para a mensagem bater com a recusa.
 */
export const nicknameSchema = z
  .string()
  .transform((v) => v.trim())
  .superRefine((v, ctx) => {
    if (v.length === 0) {
      ctx.addIssue({ code: "custom", message: "Informe o apelido do aluno.", params: { code: "nickname_required" } });
      return;
    }
    if (/\s/.test(v)) {
      ctx.addIssue({ code: "custom", message: "Use só um apelido, sem sobrenome.", params: { code: "nickname_has_surname" } });
      return;
    }
    if (v.length < NICKNAME_MIN || v.length > NICKNAME_MAX) {
      ctx.addIssue({
        code: "custom",
        message: `O apelido deve ter entre ${NICKNAME_MIN} e ${NICKNAME_MAX} letras.`,
        params: { code: "nickname_length" },
      });
      return;
    }
    if (/[0-9]/.test(v)) {
      ctx.addIssue({ code: "custom", message: "O apelido não pode ter número.", params: { code: "nickname_digits" } });
      return;
    }
    if (/[\x00-\x1f\x7f]/.test(v)) {
      ctx.addIssue({ code: "custom", message: "Apelido inválido.", params: { code: "nickname_invalid" } });
    }
  });

/** Slug de `features/grades/catalog.ts` (espelha `public.grades`, S05). */
export const gradeSlugSchema = z.string().refine((v) => findGrade(v) !== null, { message: "Escolha uma série." });

/** Ano letivo: só o corrente ou o seguinte (mesma janela do envio de lista, S07), calculado a partir de `now`. */
export function schoolYearSchema(now: Date) {
  const years = academicYears(now);
  return z.coerce.number().int().refine((v) => years.includes(v), { message: "Escolha um ano letivo válido." });
}

export function studentFieldsSchema(now: Date) {
  return z.object({
    nickname: nicknameSchema,
    schoolId: z.uuid({ message: "Escolha a escola do aluno." }),
    gradeSlug: gradeSlugSchema,
    schoolYear: schoolYearSchema(now),
  });
}

export type StudentFields = z.infer<ReturnType<typeof studentFieldsSchema>>;

export const studentIdSchema = z.uuid();
