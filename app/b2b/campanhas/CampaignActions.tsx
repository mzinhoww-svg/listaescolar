"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  ownerTransitionCampaignAction,
  resumeCampaignAction,
  submitCampaignAction,
} from "@/features/campaigns/actions";
import type { CampaignRow } from "@/features/campaigns/repository";

type Result = { ok: boolean; message?: string };
const asConfirm = async (fn: () => Promise<Result>) => {
  const r = await fn();
  return r.ok
    ? ({ ok: true } as const)
    : ({ ok: false, message: r.message ?? "Não foi possível concluir agora." } as const);
};

/** Ações do dono sobre a campanha. Pausar e Concluir passam por confirmação com o efeito escrito. */
export function CampaignActions({
  campaign,
  onDone,
}: {
  campaign: CampaignRow;
  onDone: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = campaign.id;

  async function run(fn: () => Promise<Result>) {
    setPending(true);
    setError(null);
    const r = await fn();
    setPending(false);
    if (!r.ok) setError(r.message ?? "Não foi possível concluir agora.");
    else onDone();
  }
  const transition = (to: "paused" | "completed") =>
    asConfirm(async () => {
      const r = await ownerTransitionCampaignAction({ campaignId: id, to });
      if (r.ok) onDone();
      return r;
    });

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-2">
        {campaign.status === "draft" ? (
          <Button
            loading={pending}
            onClick={() => run(() => submitCampaignAction({ campaignId: id }))}
          >
            Enviar para aprovação
          </Button>
        ) : null}
        {campaign.status === "paused" && campaign.pauseOrigin !== "admin" ? (
          <Button
            loading={pending}
            onClick={() => run(() => resumeCampaignAction({ campaignId: id }))}
          >
            Retomar
          </Button>
        ) : null}
        {campaign.status === "approved" ? (
          <ConfirmDialog
            triggerLabel="Pausar"
            triggerStyle="button"
            triggerVariant="outline"
            confirmVariant="primary"
            title="Pausar campanha"
            body="A campanha deixa de aparecer para as famílias agora. Você pode retomar quando quiser."
            confirmLabel="Pausar campanha"
            pendingLabel="Pausando…"
            onConfirm={() => transition("paused")}
          />
        ) : null}
        {campaign.status === "approved" || campaign.status === "paused" ? (
          <ConfirmDialog
            triggerLabel="Concluir"
            triggerStyle="button"
            title="Concluir campanha"
            body="A campanha encerra e não pode ser reaberta. Para anunciar de novo, crie uma campanha nova."
            confirmLabel="Concluir campanha"
            pendingLabel="Concluindo…"
            onConfirm={() => transition("completed")}
          />
        ) : null}
      </div>
      {campaign.status === "paused" && campaign.pauseOrigin === "admin" ? (
        <span className="text-texto-3 text-[13px] font-semibold">
          Pausada pelo admin: só ele retoma
        </span>
      ) : null}
      {error ? (
        <p role="alert" className="text-erro-texto text-[13px] font-bold">
          {error}
        </p>
      ) : null}
    </div>
  );
}
