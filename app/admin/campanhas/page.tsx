import { AdminShell } from "@/components/admin/AdminShell";
import { getSessionActor } from "@/features/auth/actor";
import { requireAccess } from "@/features/auth/guard";
import { listCampaignsPendingReview } from "@/features/campaigns/queries";

import { PendingCampaignRow } from "./PendingCampaignRow";

// Admin16 (`/admin/campanhas`): fila de aprovação de campanhas com checagem Procon. O bloqueio de marca exigida
// (Lei 12.886) é decidido POR LISTA, na hora de servir (`b2b_campaign_serve`) — aqui só um aviso informativo,
// porque a mesma campanha pode ser elegível numa lista e bloqueada noutra.

export const dynamic = "force-dynamic";
export const metadata = { title: "Campanhas B2B · Admin · ListaCerta" };

export default async function Page() {
  const { user } = await requireAccess("/admin/campanhas");
  const actor = await getSessionActor();
  const campaigns = actor ? await listCampaignsPendingReview(actor) : [];

  return (
    <AdminShell active="/admin/campanhas" email={user.email} breadcrumb="Admin / Campanhas B2B" title="Fila de aprovação">
      <p className="text-texto-2 mb-6 max-w-2xl text-[14px] font-semibold">
        Toda campanha aparece para as famílias como &ldquo;Sugestão patrocinada&rdquo;. Ela nunca serve numa lista cuja categoria alvo tem item de marca exigida pela escola — a checagem é automática,
        por lista, dentro de <code>b2b_campaign_serve</code>, e continua valendo mesmo depois de aprovada.
      </p>
      {campaigns.length === 0 ? (
        <p className="text-texto-2 rounded-[20px] bg-white p-6 text-[15px] font-bold">Nenhuma campanha aguardando aprovação.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {campaigns.map((c) => (
            <PendingCampaignRow key={c.id} campaign={c} />
          ))}
        </div>
      )}
    </AdminShell>
  );
}
