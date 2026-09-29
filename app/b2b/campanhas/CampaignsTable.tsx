"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ownerTransitionCampaignAction, resumeCampaignAction, submitCampaignAction } from "@/features/campaigns/actions";
import type { CampaignRow } from "@/features/campaigns/repository";
import { CampaignStatusBadge, PRICING_MODEL_LABEL, type CampaignStatus } from "@/components/b2b/CampaignStatusBadge";

const centsToReais = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;

function Actions({ campaign, onDone }: { campaign: CampaignRow; onDone: () => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setPending(true);
    setError(null);
    const r = await fn();
    setPending(false);
    if (!r.ok) setError(r.message ?? "Não foi possível concluir agora.");
    else onDone();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-2">
        {campaign.status === "draft" ? (
          <button type="button" disabled={pending} onClick={() => run(() => submitCampaignAction({ campaignId: campaign.id }))} className="bg-tinta text-papel rounded-botao h-9 px-3 text-[13px] font-extrabold disabled:opacity-50">
            Enviar para aprovação
          </button>
        ) : null}
        {campaign.status === "approved" ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => ownerTransitionCampaignAction({ campaignId: campaign.id, to: "paused" }))}
            className="bg-campo text-texto-2 rounded-botao h-9 px-3 text-[13px] font-extrabold disabled:opacity-50"
          >
            Pausar
          </button>
        ) : null}
        {campaign.status === "paused" && campaign.pauseOrigin !== "admin" ? (
          <button type="button" disabled={pending} onClick={() => run(() => resumeCampaignAction({ campaignId: campaign.id }))} className="bg-verde-certo text-tinta rounded-botao h-9 px-3 text-[13px] font-extrabold disabled:opacity-50">
            Retomar
          </button>
        ) : null}
        {campaign.status === "paused" && campaign.pauseOrigin === "admin" ? (
          <span className="text-texto-3 self-center text-[12px] font-semibold">Pausada pelo admin — só ele retoma</span>
        ) : null}
        {campaign.status === "approved" || campaign.status === "paused" ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => ownerTransitionCampaignAction({ campaignId: campaign.id, to: "completed" }))}
            className="bg-campo text-texto-2 rounded-botao h-9 px-3 text-[13px] font-extrabold disabled:opacity-50"
          >
            Concluir
          </button>
        ) : null}
      </div>
      {error ? <p className="text-[12px] font-bold text-erro-texto">{error}</p> : null}
    </div>
  );
}

export function CampaignsTable({ campaigns }: { campaigns: readonly CampaignRow[] }) {
  const router = useRouter();
  return (
    <div className="overflow-x-auto rounded-[20px] bg-white">
      <table className="w-full min-w-[720px] text-left text-[14px]">
        <thead className="text-texto-3 text-[12px] font-extrabold uppercase">
          <tr>
            <th className="px-5 py-3">Campanha</th>
            <th className="px-5 py-3">Status</th>
            <th className="px-5 py-3">Modelo</th>
            <th className="px-5 py-3">Categoria alvo</th>
            <th className="px-5 py-3">Gasto acumulado</th>
            <th className="px-5 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-[#EFEBE2]">
          {campaigns.map((c) => (
            <tr key={c.id}>
              <td className="px-5 py-4 font-bold">
                {c.name}
                <p className="text-texto-3 text-[12px] font-semibold">{c.productLabel}</p>
              </td>
              <td className="px-5 py-4">
                <CampaignStatusBadge status={c.status as CampaignStatus} />
                {c.statusReason ? <p className="text-texto-3 mt-1 text-[12px] font-semibold">{c.statusReason}</p> : null}
              </td>
              <td className="px-5 py-4">{PRICING_MODEL_LABEL[c.pricingModel]}</td>
              <td className="px-5 py-4">{c.targetCategory}</td>
              <td className="px-5 py-4">
                {centsToReais(c.accruedTotalCents)} <span className="text-texto-3">/ {centsToReais(c.totalBudgetCents)}</span>
                <p className="text-texto-3 text-[12px] font-semibold">Acúmulo informativo (nunca cobrança automática)</p>
              </td>
              <td className="px-5 py-4">
                <Actions campaign={c} onDone={() => router.refresh()} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
