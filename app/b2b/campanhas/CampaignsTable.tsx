"use client";

import { useRouter } from "next/navigation";

import type { CampaignRow } from "@/features/campaigns/repository";
import { CampaignActions } from "./CampaignActions";
import {
  CampaignStatusBadge,
  PRICING_MODEL_LABEL,
  type CampaignStatus,
} from "@/components/b2b/CampaignStatusBadge";

const centsToReais = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;

function Cards({ campaigns, onDone }: { campaigns: readonly CampaignRow[]; onDone: () => void }) {
  return (
    <ul className="flex flex-col gap-3 md:hidden">
      {campaigns.map((c) => (
        <li key={c.id} className="flex flex-col gap-3 rounded-[20px] bg-white p-4 text-[14px]">
          <div>
            <p className="font-bold [overflow-wrap:anywhere]">{c.name}</p>
            <p className="text-texto-3 text-[13px] font-semibold [overflow-wrap:anywhere]">
              {c.productLabel}
            </p>
          </div>
          <div>
            <CampaignStatusBadge status={c.status as CampaignStatus} />
            {c.statusReason ? (
              <p className="text-texto-3 mt-1 text-[13px] font-semibold">{c.statusReason}</p>
            ) : null}
          </div>
          <p className="text-texto-2 font-semibold">
            {PRICING_MODEL_LABEL[c.pricingModel]} · {c.targetCategory}
          </p>
          <p>
            {centsToReais(c.accruedTotalCents)}{" "}
            <span className="text-texto-3">/ {centsToReais(c.totalBudgetCents)}</span>
            <span className="text-texto-3 block text-[13px] font-semibold">
              Acúmulo informativo (nunca cobrança automática)
            </span>
          </p>
          <CampaignActions campaign={c} onDone={onDone} />
        </li>
      ))}
    </ul>
  );
}

export function CampaignsTable({ campaigns }: { campaigns: readonly CampaignRow[] }) {
  const router = useRouter();
  return (
    <>
      <Cards campaigns={campaigns} onDone={() => router.refresh()} />
      <div
        className="hidden overflow-x-auto rounded-[20px] bg-white md:block"
        tabIndex={0}
        role="region"
        aria-label="Tabela (role para o lado para ver todas as colunas)"
      >
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
          <tbody className="divide-linha divide-y">
            {campaigns.map((c) => (
              <tr key={c.id}>
                <td className="px-5 py-4 font-bold">
                  {c.name}
                  <p className="text-texto-3 text-[12px] font-semibold">{c.productLabel}</p>
                </td>
                <td className="px-5 py-4">
                  <CampaignStatusBadge status={c.status as CampaignStatus} />
                  {c.statusReason ? (
                    <p className="text-texto-3 mt-1 text-[12px] font-semibold">{c.statusReason}</p>
                  ) : null}
                </td>
                <td className="px-5 py-4">{PRICING_MODEL_LABEL[c.pricingModel]}</td>
                <td className="px-5 py-4">{c.targetCategory}</td>
                <td className="px-5 py-4">
                  {centsToReais(c.accruedTotalCents)}{" "}
                  <span className="text-texto-3">/ {centsToReais(c.totalBudgetCents)}</span>
                  <p className="text-texto-3 text-[12px] font-semibold">
                    Acúmulo informativo (nunca cobrança automática)
                  </p>
                </td>
                <td className="px-5 py-4">
                  <CampaignActions campaign={c} onDone={() => router.refresh()} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
