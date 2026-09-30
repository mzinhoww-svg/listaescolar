import { CurlSample } from "@/components/b2b/CurlSample";
import { getSessionActor } from "@/features/auth/actor";
import { siteBase } from "@/lib/site-base";
import { getMyPartnerHeader, getMyPartnerOverview } from "@/features/b2b/queries";
import type { B2bPartnerType } from "@/features/b2b/scopes";
import { KEY_ROTATION_GRACE_DAYS } from "@/features/b2b/limits";
import type { B2bPartnerStatus } from "@/features/b2b/states";

import { KeyTable } from "./KeyTable";
import { NewKeyDialog } from "./NewKeyDialog";

// B2B02 (`/b2b/api`): tabela de chaves, "Nova chave", limites do plano e uso de hoje. Estados bloqueados
// (pendente/recusado/suspenso) mostram um aviso e a tabela em modo leitura, sem `NewKeyDialog`. Página sempre
// dinâmica (sessão + dado sensível de uso/chave): nunca cacheada.

export const dynamic = "force-dynamic";
export const metadata = { title: "API e chaves · Portal B2B · ListaCerta" };

function siteOrigin(): string {
  return (siteBase() ?? "https://SEU_ENDERECO_DA_LISTACERTA").replace(/\/$/, "");
}

export default async function Page() {
  const actor = await getSessionActor();
  const [overview, header] = actor ? await Promise.all([getMyPartnerOverview(actor), getMyPartnerHeader(actor)]) : [null, null];
  if (!overview) return <p className="text-texto-2 text-[15px] font-bold">Não foi possível carregar suas chaves agora.</p>;

  const blocked = overview.status === "pending" || overview.status === "rejected" || overview.status === "suspended";
  const usableCountByEnv = {
    test: overview.keys.filter((k) => k.environment === "test" && k.status === "active").length,
    live: overview.keys.filter((k) => k.environment === "live" && k.status === "active").length,
  } as const;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[30px] leading-[1.1] font-extrabold tracking-[-0.035em]">API e chaves</h1>
        {blocked || !header ? null : (
          <NewKeyDialog partnerType={header.partnerType as B2bPartnerType} partnerStatus={overview.status as B2bPartnerStatus} usableCountByEnv={usableCountByEnv} />
        )}
      </div>

      {overview.status === "pending" ? (
        <p role="status" className="bg-campo text-texto-2 rounded-campo px-4 py-3 text-[14px] font-bold">
          Aguardando aprovação. Você poderá criar chaves depois da aprovação.
        </p>
      ) : null}
      {overview.status === "rejected" ? (
        <p role="alert" className="bg-erro-fundo text-erro-texto rounded-campo px-4 py-3 text-[14px] font-bold">
          Cadastro recusado{header?.statusReason ? `: ${header.statusReason}` : "."}
        </p>
      ) : null}
      {overview.status === "suspended" ? (
        <p role="alert" className="bg-erro-fundo text-erro-texto rounded-campo px-4 py-3 text-[14px] font-bold">
          Conta suspensa: as chaves foram revogadas. Portal somente leitura.
        </p>
      ) : null}

      <KeyTable keys={overview.keys} readOnly={blocked} />

      {blocked ? null : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-[20px] bg-white p-5">
              <h2 className="text-[16px] font-extrabold">Limites do plano</h2>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-[14px]">
                <div><dt className="text-texto-3 text-[12px] font-bold">Sandbox · por minuto</dt><dd className="font-extrabold">{overview.limits.testRatePerMinute ?? "—"}</dd></div>
                <div><dt className="text-texto-3 text-[12px] font-bold">Sandbox · por dia</dt><dd className="font-extrabold">{overview.limits.testRatePerDay ?? "—"}</dd></div>
                <div><dt className="text-texto-3 text-[12px] font-bold">Produção · por minuto</dt><dd className="font-extrabold">{overview.limits.liveRatePerMinute ?? "—"}</dd></div>
                <div><dt className="text-texto-3 text-[12px] font-bold">Produção · por dia</dt><dd className="font-extrabold">{overview.limits.liveRatePerDay ?? "—"}</dd></div>
              </dl>
            </div>
            <div className="rounded-[20px] bg-white p-5">
              <h2 className="text-[16px] font-extrabold">Uso de hoje</h2>
              <dl className="mt-3 grid grid-cols-3 gap-3 text-[14px]">
                <div><dt className="text-texto-3 text-[12px] font-bold">Chamadas</dt><dd className="font-extrabold">{overview.callsToday}</dd></div>
                <div><dt className="text-texto-3 text-[12px] font-bold">Erros 4xx</dt><dd className="font-extrabold">{overview.errors4xxToday}</dd></div>
                <div><dt className="text-texto-3 text-[12px] font-bold">Respostas 429</dt><dd className="font-extrabold">{overview.rateLimitedToday}</dd></div>
              </dl>
            </div>
          </div>
          <div className="rounded-[20px] bg-white p-5">
            <h2 className="text-[16px] font-extrabold">Autenticação</h2>
            <p className="text-texto-2 mt-1 text-[14px] font-medium">
              Envie a chave no cabeçalho <code className="font-bold">x-listacerta-key</code>. Copie o exemplo, troque <code className="font-bold">SUA_CHAVE</code> pela chave criada e rode no terminal.
            </p>
            <div className="mt-3">
              <CurlSample environment={overview.status === "active" ? "live" : "test"} origin={siteOrigin()} />
            </div>
            <p className="text-texto-3 mt-2 text-[12px] font-semibold">Rotação sem downtime: a chave anterior vale por até {KEY_ROTATION_GRACE_DAYS.max} dias (padrão {KEY_ROTATION_GRACE_DAYS.default}).</p>
          </div>
        </>
      )}
    </div>
  );
}
