// Escolha da escola no envio (S11, D-002). Pura e testável: o banco fecha a regra de novo (`submissions_create` recusa envio de
// escola sem vínculo em `school_members`), então este módulo só evita a viagem e dá a mensagem certa.
import { z } from "zod";

import type { UserRole } from "@/features/auth/access";

export type SchoolChoice =
  | { ok: true; source: "parent" | "school"; schoolId?: string }
  | { ok: false; code: "invalid_input" | "school_not_linked" };

const schoolIdSchema = z.string().uuid();

/**
 * - família (`parent`): envia como família; a escola é opcional e pode ser qualquer uma (a busca só mostra município habilitado;
 *   o servidor confere que a escola é pública); sem escola, o admin a atribui na revisão;
 * - escola (`school_member`, `admin`): com `schoolId`, é envio da escola e a escola tem de estar entre as VINCULADAS ao remetente;
 *   sem `schoolId`, é envio como família (o formulário de família não pede vínculo).
 */
export function resolveSchoolChoice(input: { role: UserRole; schoolId: unknown; linkedSchoolIds: readonly string[] }): SchoolChoice {
  const raw = input.schoolId;
  if (raw === undefined || raw === null || raw === "") return { ok: true, source: "parent" };
  const id = schoolIdSchema.safeParse(raw);
  if (!id.success) return { ok: false, code: "invalid_input" };
  if (input.role === "parent") return { ok: true, source: "parent", schoolId: id.data };
  if (!input.linkedSchoolIds.includes(id.data)) return { ok: false, code: "school_not_linked" };
  return { ok: true, source: "school", schoolId: id.data };
}
