// Utilitários de fuso puros (sem dependência nova): convertem entre um instante UTC e as partes locais de um fuso
// IANA, e o inverso (partes locais -> instante UTC). Usados pela S21 para a temporada e os vencimentos em
// America/Cuiaba (SQL faz o mesmo com `at time zone`); a função funciona para qualquer fuso do Intl do runtime.

export type DateParts = { year: number; month: number; day: number };

function partsOf(date: Date, timeZone: string): Record<string, string> {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  return map;
}

/** Ano/mês/dia locais (no fuso) do instante. */
export function localDateParts(date: Date, timeZone: string): DateParts {
  const m = partsOf(date, timeZone);
  return { year: Number(m.year), month: Number(m.month), day: Number(m.day) };
}

function offsetMinutesAt(instantMs: number, timeZone: string): number {
  const m = partsOf(new Date(instantMs), timeZone);
  const asUtc = Date.UTC(Number(m.year), Number(m.month) - 1, Number(m.day), Number(m.hour), Number(m.minute), Number(m.second));
  return (asUtc - instantMs) / 60_000;
}

/** Instante UTC que corresponde à parede de relógio `y-m-d hh:mm:ss` NO FUSO informado. */
export function zonedTimeToUtc(y: number, m: number, d: number, hh: number, mm: number, ss: number, timeZone: string): Date {
  const guess = Date.UTC(y, m - 1, d, hh, mm, ss);
  const offset = offsetMinutesAt(guess, timeZone);
  let t = guess - offset * 60_000;
  const offset2 = offsetMinutesAt(t, timeZone);
  if (offset2 !== offset) t = guess - offset2 * 60_000;
  return new Date(t);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Soma `n` meses à data local, com o dia limitado ao fim do mês de destino (mesma semântica de `date + interval`). */
export function addMonthsClamped(parts: DateParts, n: number): DateParts {
  const total = (parts.month - 1) + n;
  const year = parts.year + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12 + 1;
  const day = Math.min(parts.day, daysInMonth(year, month));
  return { year, month, day };
}

export function compareDateParts(a: DateParts, b: DateParts): number {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  return a.day - b.day;
}

export function formatDateParts(p: DateParts): string {
  return `${String(p.year).padStart(4, "0")}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}
