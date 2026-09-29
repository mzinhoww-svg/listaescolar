import type { CostPanelStats } from "@/features/ai-settings/cost";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const USD = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 });
const RATE = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const GOAL_CENTS = 50;

const brl = (cents: number) => BRL.format(cents / 100);
const usd = (micros: number) => USD.format(micros / 1_000_000);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function Stat({ label, usdMicros, brlCents }: { label: string; usdMicros: number; brlCents: number | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-texto-2 text-[13px] font-bold">{label}</dt>
      <dd className="text-[22px] leading-tight font-extrabold">{brlCents === null ? "BRL indisponível" : brl(brlCents)}</dd>
      <dd className="text-texto-2 text-[13px] font-semibold">{usd(usdMicros)}</dd>
    </div>
  );
}

/**
 * Custo de IA por lista (S28, M02). Só mostra o que o provedor informou; custo parcial fica fora das médias e sem taxa
 * cadastrada os reais ficam "indisponíveis". Nunca exibe zero no lugar de "não sabemos".
 */
export function AiCostPanel({ stats }: { stats: CostPanelStats | null }) {
  return (
    <section aria-label="Custo de IA por lista" className="grid max-w-2xl gap-3 rounded-[20px] bg-white p-6">
      <h2 className="text-[18px] font-extrabold">Custo por lista</h2>
      {stats === null ? (
        <p className="text-texto-2 text-[14px] font-semibold">Custo por lista indisponível: não foi possível ler o uso registrado agora.</p>
      ) : stats.usdMicros === null ? (
        <>
          <p className="text-[14px] font-bold">Indisponível.</p>
          <p className="text-texto-2 text-[14px] font-semibold">
            Nenhuma lista com custo informado pelo provedor ainda
            {stats.partialLists > 0 ? ` (${plural(stats.partialLists, "lista com custo parcial", "listas com custo parcial")}, fora das médias)` : ""}. O custo real vem do
            que o provedor devolve em cada leitura; sem esse dado nada é estimado.
          </p>
        </>
      ) : (
        <>
          <dl className="grid gap-4 sm:grid-cols-3">
            <Stat label="Média" usdMicros={stats.usdMicros.mean} brlCents={stats.brlCents?.mean ?? null} />
            <Stat label="p95" usdMicros={stats.usdMicros.p95} brlCents={stats.brlCents?.p95 ?? null} />
            <Stat label="Máximo" usdMicros={stats.usdMicros.max} brlCents={stats.brlCents?.max ?? null} />
          </dl>
          <p className="text-texto-2 text-[13px] font-semibold">
            {plural(stats.completeLists, "lista com custo completo", "listas com custo completo")} nas contas acima.
            {stats.partialLists > 0 ? ` ${plural(stats.partialLists, "lista com custo parcial", "listas com custo parcial")}, fora das médias (alguma leitura não informou custo).` : ""}
          </p>
          {stats.brlCents !== null ? (
            <p className="text-[13px] font-bold">
              Meta: menos de {brl(GOAL_CENTS)} por lista. Média {stats.brlCents.mean < GOAL_CENTS ? "dentro" : "fora"} da meta.
            </p>
          ) : null}
        </>
      )}
      <p className="text-texto-2 text-[13px] font-semibold">
        {stats?.rate ? `Taxa em uso: ${RATE.format(stats.rate)} BRL por USD (informada pelo operador).` : "Taxa de câmbio não informada: BRL indisponível."}
      </p>
    </section>
  );
}
