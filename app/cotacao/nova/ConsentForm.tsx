"use client";

import { useId, useRef, useState } from "react";

import { SubmitButton } from "@/components/cart/SubmitButton";
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
  /** Uma chave por renderização: reenviar o MESMO formulário devolve o MESMO pedido (o servidor também é idempotente pela chave). */
  idempotencyKey: string;
  preview: string | null;
};

/** Consentimento (App21): o que vai, o que a papelaria vê, prévia da mensagem e checkbox desmarcado. */
export function ConsentForm({ action, cartId, stationeryId, stationeryName, neighborhood, idempotencyKey, preview }: Props) {
  const [accepted, setAccepted] = useState(false);
  const reasonId = useId();
  // Segundo envio enquanto o primeiro roda (toque duplo, Enter repetido) é ignorado; o servidor ainda garante um pedido só pela chave.
  const sending = useRef(false);
  async function submit(formData: FormData): Promise<void> {
    if (sending.current) return;
    sending.current = true;
    try {
      await action(formData);
    } finally {
      sending.current = false;
    }
  }
  return (
    <form action={submit} className="flex flex-col gap-4" aria-label={`Consentimento para ${stationeryName}`}>
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
      {preview ? (
        <MessagePreview text={preview} note="O código definitivo aparece depois de confirmar. O endereço do pedido só abre para a papelaria; você acompanha por aqui." />
      ) : (
        <p className="text-texto-3 text-[13px] font-semibold">Prévia indisponível.</p>
      )}
      <label className="flex min-h-11 items-start gap-3 text-[14px] font-bold">
        <input
          type="checkbox"
          name="consent"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          className="mt-0.5 size-5 shrink-0"
        />
        <span>{LEAD_CONSENT_LABEL}</span>
      </label>
      <SubmitButton pendingLabel="Enviando o pedido" size="lg" className="w-full" disabled={!accepted} describedBy={accepted ? undefined : reasonId}>
        Confirmar pedido de cotação
      </SubmitButton>
      {accepted ? null : (
        <p id={reasonId} className="text-texto-2 -mt-2 text-center text-[13px] font-semibold">
          Marque a caixa acima para confirmar o pedido.
        </p>
      )}
    </form>
  );
}
