import { getSessionActor } from "@/features/auth/actor";
import { getMyPartnerOverview } from "@/features/b2b/queries";
import { getWebhookService } from "@/features/webhooks/wiring";

import { DeliveriesTable } from "./DeliveriesTable";
import { EndpointsSection } from "./EndpointsSection";

// B2B05 (`/b2b/webhooks`): endpoints, eventos, segredo HMAC e entregas com reenvio manual.

export const dynamic = "force-dynamic";
export const metadata = { title: "Webhooks · Portal B2B · ListaCerta" };

export default async function Page() {
  const actor = await getSessionActor();
  const overview = actor ? await getMyPartnerOverview(actor) : null;
  if (!actor || !overview) return <p className="text-texto-2 text-[15px] font-bold">Não foi possível carregar seu parceiro agora.</p>;

  const blocked = overview.status === "pending" || overview.status === "rejected" || overview.status === "suspended";
  const service = getWebhookService();
  const [endpoints, deliveries] = blocked ? [[], []] : await Promise.all([service.listEndpoints(actor), service.listDeliveries(actor)]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-[30px] leading-[1.1] font-extrabold tracking-[-0.035em]">Webhooks</h1>
      {blocked ? (
        <p role="status" className="bg-campo text-texto-2 rounded-campo px-4 py-3 text-[14px] font-bold">
          Webhooks ficam disponíveis depois da aprovação do cadastro.
        </p>
      ) : (
        <>
          <EndpointsSection endpoints={endpoints} />
          <div className="flex flex-col gap-3">
            <h2 className="text-[18px] font-extrabold">Entregas recentes</h2>
            <DeliveriesTable deliveries={deliveries} />
          </div>
        </>
      )}
    </div>
  );
}
