"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

import { MessagePreview } from "@/components/leads/MessagePreview";
import {
  LEAD_CONSENT_LABEL,
  LEAD_CONSENT_NEVER,
  LEAD_CONSENT_SENDS,
  LEAD_CONSENT_STATIONERY_SEES,
} from "@/features/leads/consent";

type Props = {
  action: (formData: FormData) => Promise<void>;
  cartId: string;
  stationeryId: string;
  stationeryName: string;
  neighborhood: string;
  /** Uma chave por renderização: reenviar o MESMO formulário devolve o MESMO pedido. */
  idempotencyKey: string;
  preview: string | null;
};

function Submit({ accepted }: { accepted: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={!accepted || pending}
      className="bg-verde-certo text-tinta rounded-botao flex h-14 w-full items-center justify-center text-base font-extrabold disabled:opacity-50"
    >
      {pending ? "Enviando..." : "Confirmar pedido de cotação"}
    </button>
  );
}

/** Consentimento (App21): o que vai, o que a papelaria vê, prévia da mensagem e checkbox desmarcado. */
export function ConsentForm({ action, cartId, stationeryId, stationeryName, neighborhood, idempotencyKey, preview }: Props) {
  const [accepted, setAccepted] = useState(false);
  return (
    <form action={action} className="flex flex-col gap-4" aria-label={`Consentimento para ${stationeryName}`}>
      <input type="hidden" name="carrinho" value={cartId} />
      <input type="hidden" name="stationeryId" value={stationeryId} />
      <input type="hidden" name="neighborhood" value={neighborhood} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <h2 className="text-[20px] font-extrabold">Pedir cotação a {stationeryName}</h2>
      <div className="bg-campo text-texto-2 rounded-campo flex flex-col gap-2 px-4 py-3 text-[13px] leading-[1.45] font-semibold">
        <p>{LEAD_CONSENT_SENDS}</p>
        <p>{LEAD_CONSENT_STATIONERY_SEES}</p>
        <p>{LEAD_CONSENT_NEVER}</p>
      </div>
      {preview ? <MessagePreview text={preview} note="O código definitivo aparece depois de confirmar." /> : <p className="text-texto-3 text-[13px] font-semibold">Prévia indisponível.</p>}
      <label className="flex items-start gap-3 text-[14px] font-bold">
        <input
          type="checkbox"
          name="consent"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          className="mt-0.5 size-5 shrink-0"
        />
        <span>{LEAD_CONSENT_LABEL}</span>
      </label>
      <Submit accepted={accepted} />
    </form>
  );
}
