export type SubmissionTone = "neutral" | "waiting" | "done" | "problem";
export type SubmissionDescription = { label: string; hint: string; tone: SubmissionTone };

const BY_STATUS: Record<string, SubmissionDescription> = {
  draft: { label: "Rascunho", hint: "O envio não foi concluído.", tone: "neutral" },
  submitted: { label: "Recebido", hint: "Recebemos o arquivo. Abra para ver o andamento.", tone: "waiting" },
  processing: { label: "Lendo a lista", hint: "A leitura está em andamento.", tone: "waiting" },
  processing_async: { label: "Lendo a lista", hint: "A leitura está demorando mais que o normal.", tone: "waiting" },
  review_needed: { label: "Lista lida", hint: "Confira os itens lidos.", tone: "done" },
  human_review: { label: "Em revisão pela equipe", hint: "A equipe confere a lista antes de ela aparecer para outras famílias.", tone: "waiting" },
  approved: { label: "Aprovada, publicando", hint: "A publicação ainda não terminou.", tone: "waiting" },
  published: { label: "Lista publicada", hint: "Ela já aparece para outras famílias.", tone: "done" },
  rejected: { label: "Não publicada", hint: "A equipe não publicou esta lista como oficial. A sua cópia continua disponível.", tone: "problem" },
  archived: { label: "Arquivado", hint: "Este envio foi arquivado.", tone: "neutral" },
};

/** Estado do envio em palavras da família. Estado desconhecido é "indisponível": nada de texto inventado. */
export function describeSubmission(status: string): SubmissionDescription {
  return BY_STATUS[status] ?? { label: "Andamento indisponível", hint: "Abra o envio para tentar ver o andamento.", tone: "neutral" };
}
