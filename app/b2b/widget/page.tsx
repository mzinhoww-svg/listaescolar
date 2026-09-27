import { getSessionActor } from "@/features/auth/actor";
import { getMyPartnerOverview } from "@/features/b2b/queries";
import { getWidgetService } from "@/features/widget/wiring";
import { getSiteOrigin } from "@/lib/site-url";

import { WidgetConfigForm } from "./WidgetConfigForm";

// B2B04 (`/b2b/widget`): configuração do widget embutível. Página sempre dinâmica (sessão + dado do parceiro).

export const dynamic = "force-dynamic";
export const metadata = { title: "Widget · Portal B2B · ListaCerta" };

export default async function Page() {
  const actor = await getSessionActor();
  const overview = actor ? await getMyPartnerOverview(actor) : null;
  if (!actor || !overview) return <p className="text-texto-2 text-[15px] font-bold">Não foi possível carregar seu parceiro agora.</p>;

  const blocked = overview.status === "pending" || overview.status === "rejected" || overview.status === "suspended";
  const coverageLabel = overview.coverageUfs && overview.coverageUfs.length > 0 ? overview.coverageUfs.join(", ") : "Nacional";
  const config = blocked ? null : await getWidgetService().getMyConfig(actor);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-[30px] leading-[1.1] font-extrabold tracking-[-0.035em]">Widget para o seu site</h1>
      {blocked ? (
        <p role="status" className="bg-campo text-texto-2 rounded-campo px-4 py-3 text-[14px] font-bold">
          O widget fica disponível depois da aprovação do cadastro.
        </p>
      ) : (
        <WidgetConfigForm partnerId={overview.partnerId} coverageLabel={coverageLabel} siteOrigin={getSiteOrigin()} initial={config ? { accentColor: config.accentColor, cartTargetDomain: config.cartTargetDomain, enabled: config.enabled } : null} />
      )}
    </div>
  );
}
