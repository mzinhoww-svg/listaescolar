import { BILLING_TIMEZONE } from "./limits";
import { addMonthsClamped, compareDateParts, daysInMonth, localDateParts, zonedTimeToUtc, type DateParts } from "./tz";

export type SeasonPlan = { seasonStartMonth: number; seasonEndMonth: number };

export type SeasonWindow = {
  /** 1º dia local do mês de início da temporada (que contém `now`, ou a próxima se `now` estiver fora). */
  seasonStart: DateParts;
  /** Último dia local do mês de fim da temporada. */
  seasonEnd: DateParts;
  /** Instante UTC do início (meia-noite local do 1º dia). */
  startsAt: Date;
  /** Instante UTC do fim EXCLUSIVO (meia-noite local do dia seguinte ao último). */
  endsAt: Date;
  inSeason: boolean;
  /** "novembro a março" (sem ano; nomes vêm do formatador, nunca de literal). */
  label: string;
};

const MONTH_FORMATTER = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" });

function monthName(month: number): string {
  return MONTH_FORMATTER.format(new Date(Date.UTC(2000, month - 1, 1)));
}

/**
 * Janela da temporada (fuso `America/Cuiaba`) do plano que contém `now`, ou a próxima se `now` estiver fora — mesmo
 * algoritmo de `billing_season_window` (0401_billing.sql), incluindo temporadas que cruzam o fim do ano.
 */
export function seasonWindow(plan: SeasonPlan, now: Date): SeasonWindow {
  const ms = plan.seasonStartMonth;
  const me = plan.seasonEndMonth;
  const local = localDateParts(now, BILLING_TIMEZONE);
  let startYear: number;
  let endYear: number;
  let inSeason: boolean;

  if (ms <= me) {
    if (local.month >= ms && local.month <= me) {
      startYear = local.year;
      endYear = local.year;
      inSeason = true;
    } else if (local.month < ms) {
      startYear = local.year;
      endYear = local.year;
      inSeason = false;
    } else {
      startYear = local.year + 1;
      endYear = local.year + 1;
      inSeason = false;
    }
  } else {
    if (local.month >= ms) {
      startYear = local.year;
      endYear = local.year + 1;
      inSeason = true;
    } else if (local.month <= me) {
      startYear = local.year - 1;
      endYear = local.year;
      inSeason = true;
    } else {
      startYear = local.year;
      endYear = local.year + 1;
      inSeason = false;
    }
  }

  const seasonStart: DateParts = { year: startYear, month: ms, day: 1 };
  const seasonEnd: DateParts = { year: endYear, month: me, day: daysInMonth(endYear, me) };
  // dia seguinte ao fim: 1º dia do mês seguinte (o fim é sempre o último dia do mês `me`).
  const dayAfterEnd: DateParts = addMonthsClamped({ year: endYear, month: me, day: 1 }, 1);
  const startsAt = zonedTimeToUtc(seasonStart.year, seasonStart.month, seasonStart.day, 0, 0, 0, BILLING_TIMEZONE);
  const endsAt = zonedTimeToUtc(dayAfterEnd.year, dayAfterEnd.month, dayAfterEnd.day, 0, 0, 0, BILLING_TIMEZONE);

  return {
    seasonStart,
    seasonEnd,
    startsAt,
    endsAt,
    inSeason,
    label: ms === me ? monthName(ms) : `${monthName(ms)} a ${monthName(me)}`,
  };
}

/**
 * Maior número de parcelas (1..`plan.passMaxInstallments`) cujos vencimentos mensais, a partir de `now` (fuso de
 * Cuiabá), cabem até o fim da temporada corrente/próxima. `null` = passe sem parcelas configuradas (plano sem passe).
 */
export function maxInstallmentsAvailable(plan: SeasonPlan & { passMaxInstallments: number | null }, now: Date): number | null {
  if (plan.passMaxInstallments === null) return null;
  const window = seasonWindow(plan, now);
  const today = localDateParts(now, BILLING_TIMEZONE);
  let best = 0;
  for (let n = 1; n <= plan.passMaxInstallments; n++) {
    const due = addMonthsClamped(today, n - 1);
    if (compareDateParts(due, window.seasonEnd) <= 0) best = n;
  }
  return best === 0 ? null : best;
}
