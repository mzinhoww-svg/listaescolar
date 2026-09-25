const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Cuiaba" });
const date = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Cuiaba" });

/** Data e hora reais (fuso de Cuiabá). Valor ausente ou inválido vira "indisponível", nunca uma data inventada. */
export function formatDateTime(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? dateTime.format(d) : "indisponível";
}
export function formatDate(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? date.format(d) : "indisponível";
}

export function formatBytes(n: number): string {
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
