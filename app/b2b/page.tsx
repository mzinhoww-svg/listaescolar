import { KpiCard } from "@/components/b2b/KpiCard";
import { UsageChart } from "@/components/b2b/UsageChart";
import { getSessionActor } from "@/features/auth/actor";
import { getMyPartnerOverview } from "@/features/b2b/queries";

// B2B01 (`/b2b`, Visão geral). Só o que existe nesta fatia: chamadas do mês, listas disponíveis (por ambiente e
// cobertura), % de itens casados, gráfico com dado real (sem "proporções ilustrativas") e limite do plano.
// "Carrinhos atribuídos" e avisos de webhook ficam de fora até a S25 (Ruling: sem fonte).

export const metadata = { title: "Visão geral · Portal B2B · ListaCerta" };

const PLAN_LABEL: Record<string, string> = {
  sandbox: "Sandbox",
  regional: "Regional",
  national: "Nacional",
  brand_campaigns: "Campanhas de marca",
  edtech_integration: "Integração EdTech",
};

export default async function Page() {
  const actor = await getSessionActor();
  const overview = actor ? await getMyPartnerOverview(actor) : null;
  if (!overview) return <p className="text-texto-2 text-[15px] font-bold">Não foi possível carregar sua visão geral agora.</p>;

  const env = overview.status === "active" ? "live" : overview.status === "sandbox" ? "test" : null;
  const listsAvailable = env === "live" ? overview.listsAvailableLive : env === "test" ? overview.listsAvailableTest : null;
  const rateDay = env === "live" ? overview.limits.liveRatePerDay : env === "test" ? overview.limits.testRatePerDay : null;
  const matchPct = overview.matchTotal > 0 ? `${Math.round((overview.matchMatched / overview.matchTotal) * 100)}%` : "indisponível";
  const hasLiveKey = overview.keys.some((k) => k.environment === "live" && k.status === "active");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[30px] leading-[1.1] font-extrabold tracking-[-0.035em]">Visão geral</h1>
        <div className="flex flex-wrap gap-2">
          <span className="bg-tinta text-papel rounded-botao px-3 py-1 text-[13px] font-extrabold">
            Plano {overview.plan ? PLAN_LABEL[overview.plan] ?? overview.plan : "sem plano"}
            {overview.coverageUfs ? ` · ${overview.coverageUfs.join(", ")}` : " · Nacional"}
          </span>
          {env ? (
            <span className="bg-verde-certo text-tinta rounded-botao px-3 py-1 text-[13px] font-extrabold">
              {env === "live" ? "Produção" : "Sandbox"}
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard tone="dark" value={String(overview.callsMonth)} label="chamadas de API no mês" />
        <KpiCard value={listsAvailable === null ? "indisponível" : String(listsAvailable)} label="listas disponíveis na sua região" />
        <KpiCard value={matchPct} label="itens casados com seus SKUs" />
        <KpiCard value={rateDay === null ? "indisponível" : String(rateDay)} label="limite do plano por dia" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-3 rounded-[22px] bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[16px] font-extrabold">Chamadas por dia</h2>
            {rateDay !== null ? <p className="text-texto-3 text-[12px] font-bold">Limite do plano: {rateDay}/dia</p> : null}
          </div>
          <UsageChart callsByDay={overview.callsByDay} />
        </div>
        <div className="flex flex-col gap-3 rounded-[20px] bg-white p-5">
          <h2 className="text-[16px] font-extrabold">Integração</h2>
          <div className="flex items-center gap-2.5 text-[14px] font-semibold">
            <span aria-hidden className={`inline-block size-2.5 rounded-full ${hasLiveKey ? "bg-verde-certo" : "bg-linha"}`} />
            {hasLiveKey ? "Chave de produção ativa" : "Nenhuma chave de produção"}
          </div>
        </div>
      </div>
    </div>
  );
}
