import { z } from "zod";

export const saveListInputSchema = z.object({
  studentId: z.uuid({ message: "Escolha um aluno." }),
  listId: z.uuid({ message: "Lista inválida." }),
  /** Rota da lista, para voltar a ela se a sessão terminar (validada por `safeNextPath` na action). */
  next: z.string().max(300).optional(),
});

export const savedListIdSchema = z.uuid();
