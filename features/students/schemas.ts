import { z } from "zod";

import { findGrade } from "@/features/grades/catalog";

export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 30;

// Só um apóstrofo interno (reto ou curvo), no máximo, entre dois grupos de letras — cobre nomes como "D'Alva".
const LETTERS_ONLY = /^\p{L}+(['’]\p{L}+)?$/u;

/**
 * Só apelido, sem sobrenome (regra de produto, SPEC §5) e só letras Unicode (correção da revisão de segurança:
 * hífen, ponto, sublinhado, arroba, dígito e caractere invisível/formatação — ex.: zero-width space — são
 * recusados, porque nenhum deles é letra). NFC normaliza antes de validar e grava sempre a forma composta (é, não
 * e + acento combinante); o apóstrofo curvo (’) vira reto (') antes de gravar, para bater com o CHECK do banco
 * (`student_nickname_valid`, 0603), que só aceita o reto.
 */
export const nicknameSchema = z
  .string()
  .transform((v) => v.normalize("NFC").trim())
  .superRefine((v, ctx) => {
    if (v.length === 0) {
      ctx.addIssue({ code: "custom", message: "Informe o apelido do aluno.", params: { code: "nickname_required" } });
      return;
    }
    // Espaço de verdade (não os invisíveis de formatação, tratados abaixo): sinal prático de "nome e sobrenome".
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
    if (!LETTERS_ONLY.test(v)) {
      ctx.addIssue({ code: "custom", message: "Use só letras, sem número, símbolo ou pontuação.", params: { code: "nickname_invalid" } });
    }
  })
  .transform((v) => v.replace(/’/g, "'"));

/** Slug de `features/grades/catalog.ts` (espelha `public.grades`, S05). */
export const gradeSlugSchema = z.string().refine((v) => findGrade(v) !== null, { message: "Escolha uma série." });

/** Só apelido e série (SPEC §5) — nenhum outro dado do aluno. Escola e ano letivo vivem na lista salva. */
export const studentFieldsSchema = z.object({
  nickname: nicknameSchema,
  gradeSlug: gradeSlugSchema,
});

export type StudentFields = z.infer<typeof studentFieldsSchema>;

export const studentIdSchema = z.uuid();
