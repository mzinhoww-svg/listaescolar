import { z } from "zod";

export const saveListInputSchema = z.object({
  studentId: z.uuid({ message: "Escolha um aluno." }),
  listId: z.uuid({ message: "Lista inválida." }),
});

export const savedListIdSchema = z.uuid();
