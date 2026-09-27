import type { SessionActor } from "@/features/auth/actor";

import { CampaignServiceError } from "./errors";
import { InsightsQueryInputSchema, type InsightsQueryInput } from "./schemas";

// Insights agregados (B2B08) com k-anonimato. A contagem CRUA vem de uma função de banco service_role-only
// (features/campaigns/repository.ts::insightsRaw), contada por ESCOLA distinta (não por lista: uma escola com
// várias listas — séries diferentes da mesma etapa, anos diferentes — conta uma vez só, senão infla a "amostra"
// sem ganhar anonimato de verdade). Nenhuma supressão acontece no banco — mora inteira aqui, testada por unidade
// (aceite do PLAN: "teste de k-anonimato").
//
// Desenho (revisão de segurança independente, rodada única): o desenho anterior tentava prevenir a subtração
// (total - visíveis = oculta) suprimindo uma SEGUNDA célula nomeada — mas isso ainda vazava nos limites: com
// exatamente 2 células ocultas cuja soma é pequena o bastante (ex. soma = k+1), só existe uma forma de dividir a
// soma em dois valores cada um < k, revelando os dois. A correção estrutural: cidades abaixo de `minK` nunca
// aparecem NOMEADAS — são somadas numa única célula anônima "outras" (sem id nem nome), e essa célula só é
// mostrada quando a PRÓPRIA SOMA já atinge `minK` (aí ela é, por definição, um agregado k-anônimo, não importa
// como as parcelas se dividem entre as cidades que a compõem). Se mesmo agregada a soma não chega a `minK`
// (ex.: uma única cidade pequena, sozinha, abaixo do limite), a célula inteira é omitida (nem número, nem nome) e
// `partial` avisa que existe dado a mais não exibido — sem revelar quanto. O TOTAL nunca é a soma bruta real: é
// SEMPRE a soma só do que já foi exibido (cidades nomeadas + "outras", quando existir). Como o total nunca
// referencia um valor que não foi mostrado, não há mais como "descontar" nada por subtração — a classe inteira de
// vazamento por limite (S = k+1 ou qualquer outro valor de fronteira) deixa de existir por construção.

export type RawCell = { id: string; label: string; count: number };
export type VisibleCity = { id: string; label: string; count: number };
export type SuppressionResult = {
  /** Cidades nomeadas: só as que, sozinhas, já atingem `minK`. */
  cities: VisibleCity[];
  /** Agregado anônimo (sem id nem nome) das cidades abaixo de `minK`; `null` quando não existe ou quando a
   * própria soma delas também fica abaixo de `minK` (nesse caso é omitido por inteiro, nunca só "achatado"). */
  others: number | null;
  /** `true` quando existe dado que não pôde ser mostrado nem individualmente nem no agregado "outras". */
  partial: boolean;
  /** Soma só do que é efetivamente exibido (`cities` + `others`) — NUNCA a soma bruta real: por desenho, não há
   * nada aqui que possa ser subtraído para recuperar uma célula oculta. */
  total: number;
};

export function applyKAnonymitySuppression(rawCells: readonly RawCell[], minK: number): SuppressionResult {
  const cities: VisibleCity[] = [];
  let smallSum = 0;
  let hasSmall = false;

  for (const c of rawCells) {
    if (c.count >= minK) cities.push({ id: c.id, label: c.label, count: c.count });
    else {
      hasSmall = true;
      smallSum += c.count;
    }
  }
  cities.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const others = hasSmall && smallSum >= minK ? smallSum : null;
  const partial = hasSmall && others === null;
  const total = cities.reduce((acc, c) => acc + c.count, 0) + (others ?? 0);

  return { cities, others, partial, total };
}

export type InsightsRepo = {
  insightsRaw: (category: string, gradeStage: string, isDemo: boolean) => Promise<readonly { cityIbge: string; cityName: string; distinctSchools: number }[]>;
  getMinK: () => Promise<number>;
  /** Ambiente (demo/real) do parceiro marca chamador; `null` = ator não é dono de parceiro marca habilitado. */
  callerBrandEnvironment: (actor: SessionActor) => Promise<{ isDemo: boolean } | null>;
};

export type InsightsResult = { minK: number; isDemo: boolean } & SuppressionResult;

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
    const suppressed = applyKAnonymitySuppression(raw.map((r) => ({ id: r.cityIbge, label: r.cityName, count: r.distinctSchools })), minK);
    return { minK, isDemo, ...suppressed };
  }
}
