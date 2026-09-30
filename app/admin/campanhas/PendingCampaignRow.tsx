"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { decideCampaignAction } from "@/features/campaigns/admin-actions";
import type { CampaignRow } from "@/features/campaigns/repository";
import { PRICING_MODEL_LABEL } from "@/components/b2b/CampaignStatusBadge";

const centsToReais = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;

export function PendingCampaignRow({ campaign }: { campaign: CampaignRow }) {
  const router = useRouter();
  const [reason, setReason] = useState("");

  async function decide(to: "approved" | "rejected"): Promise<{ ok: true } | { ok: false; message: string }> {
    if (to === "rejected" && reason.trim() === "") return { ok: false, message: "Informe o motivo da recusa." };
    const r = await decideCampaignAction({ campaignId: campaign.id, to, reason: to === "rejected" ? reason : undefined });
    if (!r.ok) return { ok: false, message: r.message };
    router.refresh();
    return { ok: true };
  }

  return (
    <div className="rounded-[20px] bg-white p-6">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[16px] font-extrabold">{campaign.name}</p>
        <p className="text-texto-3 text-[12px] font-semibold">{campaign.isDemo ? "Ambiente de demonstração" : "Ambiente real"}</p>
      </div>
      <p className="text-texto-2 mb-1 text-[14px] font-semibold">{campaign.productLabel}</p>
      <p className="text-texto-2 mb-3 text-[13px] font-semibold">Criativo: {campaign.creativeText ?? "indisponível"}</p>
      <dl className="mb-4 grid grid-cols-2 gap-2 text-[13px] sm:grid-cols-4">
        <div><dt className="text-texto-3 font-semibold">Categoria alvo</dt><dd className="font-bold">{campaign.targetCategory}</dd></div>
        <div><dt className="text-texto-3 font-semibold">Modelo</dt><dd className="font-bold">{PRICING_MODEL_LABEL[campaign.pricingModel]}</dd></div>
        <div><dt className="text-texto-3 font-semibold">Bid declarado</dt><dd className="font-bold">{centsToReais(campaign.bidCents)}</dd></div>
        <div><dt className="text-texto-3 font-semibold">Orçamento total</dt><dd className="font-bold">{centsToReais(campaign.totalBudgetCents)}</dd></div>
      </dl>
      <div className="flex flex-wrap gap-2">
        <ConfirmDialog
          triggerLabel="Aprovar"
          triggerStyle="button"
          triggerVariant="primary"
          confirmVariant="primary"
          title={`Aprovar a campanha “${campaign.name}”?`}
          body="A campanha passa a aparecer para as famílias como “Sugestão patrocinada”, dentro do orçamento declarado. A checagem de marca exigida continua valendo por lista."
          confirmLabel="Aprovar campanha"
          onConfirm={() => decide("approved")}
        />
        <ConfirmDialog
          triggerLabel="Recusar"
          triggerStyle="button"
          triggerVariant="outline"
          title={`Recusar a campanha “${campaign.name}”?`}
          body={
            <>
              <p>A campanha não vai ao ar e o parceiro vê o motivo.</p>
              <label className="mt-3 block text-[13px] font-extrabold" htmlFor={`motivo-${campaign.id}`}>Motivo da recusa (obrigatório)</label>
              <textarea id={`motivo-${campaign.id}`} value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} className="mt-1 w-full rounded-campo bg-campo p-3 text-[14px]" />
            </>
          }
          confirmLabel="Recusar campanha"
          onConfirm={() => decide("rejected")}
        />
      </div>
    </div>
  );
}
