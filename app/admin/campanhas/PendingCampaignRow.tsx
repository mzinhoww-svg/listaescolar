"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { decideCampaignAction } from "@/features/campaigns/admin-actions";
import type { CampaignRow } from "@/features/campaigns/repository";
import { PRICING_MODEL_LABEL } from "@/components/b2b/CampaignStatusBadge";

const centsToReais = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;

export function PendingCampaignRow({ campaign }: { campaign: CampaignRow }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);

  async function decide(to: "approved" | "rejected") {
    if (to === "rejected" && !rejecting) {
      setRejecting(true);
      return;
    }
    setPending(true);
    setError(null);
    const r = await decideCampaignAction({ campaignId: campaign.id, to, reason: to === "rejected" ? reason : undefined });
    setPending(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="rounded-[20px] bg-white p-6">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[16px] font-extrabold">{campaign.name}</p>
        <p className="text-texto-3 text-[12px] font-semibold">{campaign.isDemo ? "Ambiente de demonstração" : "Ambiente real"}</p>
      </div>
      <p className="text-texto-2 mb-3 text-[14px] font-semibold">{campaign.productLabel}</p>
      <dl className="mb-4 grid grid-cols-2 gap-2 text-[13px] sm:grid-cols-4">
        <div>
          <dt className="text-texto-3 font-semibold">Categoria alvo</dt>
          <dd className="font-bold">{campaign.targetCategory}</dd>
        </div>
        <div>
          <dt className="text-texto-3 font-semibold">Modelo</dt>
          <dd className="font-bold">{PRICING_MODEL_LABEL[campaign.pricingModel]}</dd>
        </div>
        <div>
          <dt className="text-texto-3 font-semibold">Bid declarado</dt>
          <dd className="font-bold">{centsToReais(campaign.bidCents)}</dd>
        </div>
        <div>
          <dt className="text-texto-3 font-semibold">Orçamento total</dt>
          <dd className="font-bold">{centsToReais(campaign.totalBudgetCents)}</dd>
        </div>
      </dl>
      {rejecting ? (
        <label className="mb-3 flex flex-col gap-1">
          <span className="text-texto-2 text-[13px] font-bold">Motivo da recusa</span>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} className="border-texto-3/30 rounded-[12px] border bg-white px-3 py-2 text-[14px]" rows={2} />
        </label>
      ) : null}
      {error ? <p className="mb-2 text-[13px] font-bold text-[#8a1c14]">{error}</p> : null}
      <div className="flex gap-2">
        <button type="button" disabled={pending} onClick={() => decide("approved")} className="bg-verde-certo text-tinta rounded-botao h-10 px-4 text-[13px] font-extrabold disabled:opacity-50">
          Aprovar
        </button>
        <button
          type="button"
          disabled={pending || (rejecting && reason.trim() === "")}
          onClick={() => decide("rejected")}
          className="bg-[#fde2e0] text-[#8a1c14] rounded-botao h-10 px-4 text-[13px] font-extrabold disabled:opacity-50"
        >
          {rejecting ? "Confirmar recusa" : "Recusar"}
        </button>
      </div>
    </div>
  );
}
