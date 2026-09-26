import type { SurveyLeadRow, SurveyResponseRow } from "./repositorio";
import {
  CANAL,
  CIDADE,
  COMPAROU,
  DORES,
  ETAPAS,
  FILHOS,
  GASTO,
  ONDE_COMPROU,
  RECEBIMENTO,
  REDE,
  TEMPO,
  ULTIMO_STEP,
  USARIA,
  type Opcao,
} from "./perguntas";

export type CartaoStats = {
  iniciadas: number;
  completas: number;
  /** completas/iniciadas, 0..1; 0 se `iniciadas` for 0. */
  taxaConclusao: number;
  /** Mediana de `completed_at - started_at` das completas, em segundos; null se nenhuma completa. */
  tempoMedianoSegundos: number | null;
  leads: number;
  /** leads/completas, 0..1; 0 se `completas` for 0. */
  taxaLead: number;
};

export type FunilEntrada = { step: number; sessoes: number };

export type OpcaoStats = { slug: string; rotulo: string; contagem: number; percentual: number };

export type PerguntaStats = { campo: string; respondentes: number; opcoes: OpcaoStats[] };

export type OrigemStats = { sourceGroup: string | null; iniciadas: number; completas: number };

export type SurveyStats = {
  cartoes: CartaoStats;
  funil: FunilEntrada[];
  porPergunta: PerguntaStats[];
  porOrigem: OrigemStats[];
  frases: string[];
};

/** Mediana: número par de amostras = média das duas centrais. null se a lista for vazia. */
function mediana(valores: readonly number[]): number | null {
  if (valores.length === 0) return null;
  const ordenado = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenado.length / 2);
  if (ordenado.length % 2 === 1) return ordenado.at(meio) ?? null;
  const a = ordenado.at(meio - 1);
  const b = ordenado.at(meio);
  return a === undefined || b === undefined ? null : (a + b) / 2;
}

function computeCartoes(
  responses: readonly SurveyResponseRow[],
  leads: readonly SurveyLeadRow[],
): CartaoStats {
  const iniciadas = responses.length;
  const completas = responses.filter(
    (r): r is SurveyResponseRow & { completed_at: string } => r.completed_at !== null,
  );
  const segundos = completas.map(
    (r) => (new Date(r.completed_at).getTime() - new Date(r.started_at).getTime()) / 1000,
  );
  return {
    iniciadas,
    completas: completas.length,
    taxaConclusao: iniciadas === 0 ? 0 : completas.length / iniciadas,
    tempoMedianoSegundos: mediana(segundos),
    leads: leads.length,
    taxaLead: completas.length === 0 ? 0 : leads.length / completas.length,
  };
}

/** 13 entradas (steps 0 a `ULTIMO_STEP`), na ordem, cada uma com a contagem de linhas naquele `last_step`. */
function computeFunil(responses: readonly SurveyResponseRow[]): FunilEntrada[] {
  const contagens = Array.from({ length: ULTIMO_STEP + 1 }, () => 0);
  for (const r of responses) {
    if (Number.isInteger(r.last_step) && r.last_step >= 0 && r.last_step <= ULTIMO_STEP) {
      contagens[r.last_step] = (contagens[r.last_step] ?? 0) + 1;
    }
  }
  return contagens.map((sessoes, step) => ({ step, sessoes }));
}

type CampoEscolha = { campo: string; opcoes: readonly Opcao[] };

/**
 * Campos de escolha da pesquisa, na ordem do roteiro (spec seção 4). `escola` e
 * `compra_ideal`/`pode_citar` ficam de fora: são texto livre, não escolha entre opções.
 */
const CAMPOS_ESCOLHA: readonly CampoEscolha[] = [
  { campo: "cidade", opcoes: CIDADE },
  { campo: "filhos", opcoes: FILHOS },
  { campo: "rede", opcoes: REDE },
  { campo: "etapas", opcoes: ETAPAS },
  { campo: "recebimento", opcoes: RECEBIMENTO },
  { campo: "onde_comprou", opcoes: ONDE_COMPROU },
  { campo: "gasto", opcoes: GASTO },
  { campo: "tempo", opcoes: TEMPO },
  { campo: "comparou", opcoes: COMPAROU },
  { campo: "dores", opcoes: DORES },
  { campo: "usaria", opcoes: USARIA },
  { campo: "canal", opcoes: CANAL },
];

/** Normaliza um valor de resposta em slugs candidatos (única = 1 slug, múltipla = vários). */
function valoresComoSlugs(valor: unknown): string[] {
  if (Array.isArray(valor)) return valor.filter((v): v is string => typeof v === "string");
  if (typeof valor === "string") return [valor];
  return [];
}

function computeUmaPergunta(
  responses: readonly SurveyResponseRow[],
  def: CampoEscolha,
): PerguntaStats {
  const slugsValidos = new Set(def.opcoes.map((o) => o.slug));
  const contagem = new Map<string, number>();
  let respondentes = 0;
  for (const r of responses) {
    const valor = r.answers[def.campo];
    if (valor === undefined || valor === null) continue;
    respondentes += 1;
    // Set: cada slug conta uma vez por linha, mesmo que o valor bruto tenha duplicatas.
    const slugsDaLinha = new Set(valoresComoSlugs(valor).filter((s) => slugsValidos.has(s)));
    for (const slug of slugsDaLinha) contagem.set(slug, (contagem.get(slug) ?? 0) + 1);
  }
  const opcoes = def.opcoes.map((o) => {
    const c = contagem.get(o.slug) ?? 0;
    return {
      slug: o.slug,
      rotulo: o.rotulo,
      contagem: c,
      percentual: respondentes === 0 ? 0 : c / respondentes,
    };
  });
  return { campo: def.campo, respondentes, opcoes };
}

function computePorPergunta(responses: readonly SurveyResponseRow[]): PerguntaStats[] {
  return CAMPOS_ESCOLHA.map((def) => computeUmaPergunta(responses, def));
}

/** Agrupa por `source_group`; `null` (sem origem) vira um grupo próprio — a UI que rotula. */
function computePorOrigem(responses: readonly SurveyResponseRow[]): OrigemStats[] {
  const grupos = new Map<string | null, { iniciadas: number; completas: number }>();
  for (const r of responses) {
    const atual = grupos.get(r.source_group) ?? { iniciadas: 0, completas: 0 };
    atual.iniciadas += 1;
    if (r.completed_at !== null) atual.completas += 1;
    grupos.set(r.source_group, atual);
  }
  return [...grupos.entries()].map(([sourceGroup, valores]) => ({ sourceGroup, ...valores }));
}

/** `compra_ideal` (não vazia) onde `pode_citar === true`. Nunca toca nome/telefone/session_id. */
function computeFrases(responses: readonly SurveyResponseRow[]): string[] {
  const frases: string[] = [];
  for (const r of responses) {
    if (r.answers.pode_citar !== true) continue;
    const frase = r.answers.compra_ideal;
    if (typeof frase === "string" && frase.trim() !== "") frases.push(frase.trim());
  }
  return frases;
}

/** Agregação pura da pesquisa (sem Supabase, sem I/O) a partir das linhas já lidas do repositório. */
export function aggregateSurvey(
  responses: SurveyResponseRow[],
  leads: SurveyLeadRow[],
): SurveyStats {
  return {
    cartoes: computeCartoes(responses, leads),
    funil: computeFunil(responses),
    porPergunta: computePorPergunta(responses),
    porOrigem: computePorOrigem(responses),
    frases: computeFrases(responses),
  };
}
