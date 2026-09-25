const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Cuiaba" });
const time = new Intl.DateTimeFormat("pt-BR", { timeStyle: "short", timeZone: "America/Cuiaba" });

const valid = (iso: string): Date | null => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};
/** Data e hora reais (Cuiabá); valor inválido vira "indisponível", nunca uma data inventada. */
export const formatWhen = (iso: string): string => { const d = valid(iso); return d ? dateTime.format(d) : "indisponível"; };
export const formatTime = (iso: string): string => { const d = valid(iso); return d ? time.format(d) : "indisponível"; };
export const formatSize = (n: number): string => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / (1024 * 1024)).toFixed(1)} MB`);
