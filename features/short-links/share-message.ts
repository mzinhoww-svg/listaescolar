export type ListShareInput = { schoolName: string; gradeLabel: string; year: number; link: string };

/**
 * Texto do compartilhamento da lista. Só escola, série, ano e link: a função não aceita
 * apelido de aluno nem outro dado do responsável (menores: só apelido e série, e apelido nunca sai da conta).
 */
export function buildListShareMessage({ schoolName, gradeLabel, year, link }: ListShareInput): string {
  return `Lista de material de ${schoolName}, ${gradeLabel}, ${year}: ${link}`;
}

export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
