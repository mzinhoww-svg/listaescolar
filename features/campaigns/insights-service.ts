import type { SessionActor } from "@/features/auth/actor";

import { CampaignServiceError } from "./errors";
import { InsightsQueryInputSchema, type InsightsQueryInput } from "./schemas";

// Insights agregados (B2B08) com k-anonimato. A contagem CRUA vem de uma função de banco service_role-only
// (features/campaigns/repository.ts::insightsRaw) SEM supressão nenhuma — a supressão mora inteira aqui, em
// TypeScript, para ser testada por unidade rápido (aceite do PLAN: "teste de k-anonimato"). Regras:
// 1) célula (cidade) com menos de `minK` listas distintas contribuindo fica oculta (count = null);
// 2) se o TOTAL (soma de todas as cidades) é visível e exatamente UMA cidade está oculta, a subtração
//    (total - soma das visíveis) revelaria o valor da oculta: suprime-se uma SEGUNDA célula (a de menor
//    contagem entre as visíveis; empate resolvido por ordem alfabética do código IBGE, para ser determinístico).
//    Se não houver nenhuma outra cidade visível para suprimir (só existe uma cidade no recorte), suprime-se o
//    TOTAL em vez disso — é a única defesa possível nesse caso degenerado.
// 3) 0 ou 2+ células já ocultas: nenhuma ação extra (a ambiguidade da subtração já é suficiente).

export type RawCell = { id: string; label: string; count: number };
export type SuppressedCell = { id: string; label: string; count: number | null; suppressed: boolean };
export type SuppressionResult = { total: { count: number | null; suppressed: boolean }; cells: SuppressedCell[] };

export function applyKAnonymitySuppression(rawCells: readonly RawCell[], minK: number): SuppressionResult {
  const totalCount = rawCells.reduce((acc, c) => acc + c.count, 0);
  const sorted = [...rawCells].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const suppressedIds = new Set(sorted.filter((c) => c.count < minK).map((c) => c.id));
  let totalSuppressed = totalCount < minK;

  if (!totalSuppressed && suppressedIds.size === 1) {
    const visible = sorted.filter((c) => !suppressedIds.has(c.id));
    if (visible.length === 0) {
      // só existe uma cidade no recorte e ela já está oculta: o total sozinho a revelaria (total = a própria célula).
      totalSuppressed = true;
    } else {
      const smallestVisible = visible.reduce((min, c) => (c.count < min.count ? c : min), visible[0]!);
      suppressedIds.add(smallestVisible.id);
    }
  }

  return {
    total: { count: totalSuppressed ? null : totalCount, suppressed: totalSuppressed },
    cells: sorted.map((c) => ({ id: c.id, label: c.label, count: suppressedIds.has(c.id) ? null : c.count, suppressed: suppressedIds.has(c.id) })),
  };
}

export type InsightsRepo = {
  insightsRaw: (category: string, gradeStage: string, isDemo: boolean) => Promise<readonly { cityIbge: string; cityName: string; distinctLists: number }[]>;
  getMinK: () => Promise<number>;
  /** Ambiente (demo/real) do parceiro marca chamador; `null` = ator não é dono de parceiro marca habilitado. */
  callerBrandEnvironment: (actor: SessionActor) => Promise<{ isDemo: boolean } | null>;
};

export type InsightsResult = { minK: number; isDemo: boolean; total: { count: number | null; suppressed: boolean }; cities: SuppressedCell[] };

export class InsightsService {
  constructor(private readonly repo: InsightsRepo) {}

  /** B2B08: só dono de parceiro marca sandbox/active (RLS do banco também barra, esta é a checagem de negócio). */
  async query(actor: SessionActor, rawInput: unknown): Promise<InsightsResult> {
    const input: InsightsQueryInput = InsightsQueryInputSchema.parse(rawInput);
    const env = await this.repo.callerBrandEnvironment(actor);
    if (!env) throw new CampaignServiceError("só parceiro marca vê insights", "forbidden");
    return this.queryAs(input, env.isDemo);
  }

  /** Admin: mesma consulta, escolhendo o ambiente explicitamente (não depende de ser dono de parceiro). */
  async queryAsAdmin(actor: SessionActor, rawInput: unknown, isDemo: boolean): Promise<InsightsResult> {
    if (actor.role !== "admin") throw new CampaignServiceError("só admin executa esta ação", "forbidden");
    const input: InsightsQueryInput = InsightsQueryInputSchema.parse(rawInput);
    return this.queryAs(input, isDemo);
  }

  private async queryAs(input: InsightsQueryInput, isDemo: boolean): Promise<InsightsResult> {
    const [raw, minK] = await Promise.all([this.repo.insightsRaw(input.category, input.gradeStage, isDemo), this.repo.getMinK()]);
    const { total, cells } = applyKAnonymitySuppression(raw.map((r) => ({ id: r.cityIbge, label: r.cityName, count: r.distinctLists })), minK);
    return { minK, isDemo, total, cities: cells };
  }
}
