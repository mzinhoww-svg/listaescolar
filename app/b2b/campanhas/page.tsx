import Link from "next/link";

import { BrandOnlyNotice } from "@/components/b2b/BrandOnlyNotice";
import { buttonClass } from "@/components/ui/Button";
import { getSessionActor } from "@/features/auth/actor";
import { getMyPartnerHeader } from "@/features/b2b/queries";
import { listMyCampaigns } from "@/features/campaigns/queries";

import { CampaignsTable } from "./CampaignsTable";

// B2B06 (`/b2b/campanhas`): campanhas de sugestão de produto (marca), status, orçamento e desempenho acumulado
// (impressões/cliques/gasto informativo — nunca dinheiro real). "Nova campanha" leva à B2B07.

export const dynamic = "force-dynamic";
export const metadata = { title: "Campanhas · Portal B2B · ListaCerta" };

export default async function Page() {
  const actor = await getSessionActor();
  if (!actor) return <p className="text-texto-2 text-[15px] font-bold">Não foi possível carregar seu parceiro agora.</p>;
  const header = await getMyPartnerHeader(actor);
  if (header && header.partnerType !== "brand") {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-[30px] leading-[1.1] font-extrabold tracking-[-0.035em]">Campanhas</h1>
        <BrandOnlyNotice partnerType={header.partnerType} />
      </div>
    );
  }
  const campaigns = await listMyCampaigns(actor);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-[30px] leading-[1.1] font-extrabold tracking-[-0.035em]">Campanhas</h1>
        <Link href="/b2b/campanhas/nova" className={buttonClass("primary", "md")}>
          Nova campanha
        </Link>
      </div>
      <p className="text-texto-2 max-w-2xl text-[14px] font-semibold">
        Toda campanha aparece para as famílias como <strong>&ldquo;Sugestão patrocinada&rdquo;</strong>, separada da lista oficial, e nunca substitui um item cuja marca a escola exige. Passa por
        aprovação do admin antes de servir.
      </p>
      {campaigns.length === 0 ? (
        <p className="text-texto-2 rounded-[20px] bg-white p-6 text-[15px] font-bold">Nenhuma campanha ainda.</p>
      ) : (
        <CampaignsTable campaigns={campaigns} />
      )}
    </div>
  );
}
