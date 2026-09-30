export type CartLabel = { schoolName: string; gradeLabel: string } | null;

const dateLong = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Cuiaba" });

/** Data do carrinho (dd/mm/aaaa, fuso de Cuiabá). */
export function cartDate(at: Date): string {
  return dateLong.format(at);
}

/**
 * Nome do carrinho na conta (UX-048): escola e série da lista de origem; sem origem resolvível (cópia privada,
 * demonstração ou falha de consulta) "Carrinho de <data>", nunca a estratégia nem dado inventado.
 */
export function cartTitle(label: CartLabel, createdAt: Date): string {
  return label ? `${label.schoolName} · ${label.gradeLabel}` : `Carrinho de ${cartDate(createdAt)}`;
}
