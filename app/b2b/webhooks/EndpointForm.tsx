"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Field, fieldInputClass } from "@/components/ui/Field";
import { InlineStatus } from "@/components/ui/InlineStatus";
import { createEndpointAction, revealSecretAction, rotateSecretAction, updateEndpointAction } from "@/features/webhooks/actions";
import { WEBHOOK_EVENTS, type WebhookEvent } from "@/features/webhooks/events";
import type { EndpointRow } from "@/features/webhooks/repository";

// Endpoint (B2B05): URL, eventos assinados e segredo HMAC. "Revelar" decifra sob demanda (nunca logado);
// "Rotacionar"/"Copiar código" seguem o padrão de "copie agora" das chaves de API (S24), mas aqui um segredo
// existente PODE ser revelado de novo (Ruling S25: o servidor precisa do segredo em claro para assinar as
// próprias chamadas de saída — ver ledger).

const EVENT_LABEL: Record<WebhookEvent, string> = {
  "list.published": "list.published",
  "list.updated": "list.updated",
  "list.archived": "list.archived",
  "school.approved": "school.approved",
};

export function EndpointForm({ endpoint, onSaved }: { endpoint: EndpointRow | null; onSaved: () => void }) {
  const [url, setUrl] = useState(endpoint?.url ?? "");
  const [events, setEvents] = useState<WebhookEvent[]>((endpoint?.events as WebhookEvent[] | undefined) ?? [...WEBHOOK_EVENTS]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [justCreatedSecret, setJustCreatedSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmingRotate, setConfirmingRotate] = useState(false);

  function toggleEvent(e: WebhookEvent) {
    setEvents((prev) => (prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]));
  }

  async function submit() {
    setPending(true);
    setError(null);
    if (endpoint) {
      const result = await updateEndpointAction({ endpointId: endpoint.id, url, events });
      setPending(false);
      if (!result.ok) {
        setError(result.message);
        return;
      }
    } else {
      const result = await createEndpointAction({ url, events });
      setPending(false);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      // "Copie agora": o segredo fica visível até o dono confirmar (`concludeCreate`) — nunca sai da tela sozinho
      // (achado do E2E: chamar `onSaved()` aqui desmontava este formulário antes de mostrar o segredo).
      setJustCreatedSecret(result.data.secret);
      return;
    }
    onSaved();
  }

  function concludeCreate() {
    setJustCreatedSecret(null);
    onSaved();
  }

  async function reveal() {
    if (!endpoint) return;
    setError(null);
    const r = await revealSecretAction({ endpointId: endpoint.id });
    if (r.ok) setRevealedSecret(r.data.secret);
    else setError(r.message);
  }

  async function rotate() {
    if (!endpoint) return;
    if (!confirmingRotate) {
      setConfirmingRotate(true);
      return;
    }
    setConfirmingRotate(false);
    setError(null);
    const r = await rotateSecretAction({ endpointId: endpoint.id });
    if (r.ok) {
      setJustCreatedSecret(r.data.secret);
      setRevealedSecret(null);
    } else setError(r.message);
  }

  const urlError = url.length > 0 && !url.startsWith("https://") ? "A URL precisa começar com https://" : undefined;
  const disabledReason = url.length === 0 ? "Informe a URL do endpoint para criar." : urlError ? null : events.length === 0 ? "Marque ao menos um evento." : null;
  const displaySecret = justCreatedSecret ?? revealedSecret;

  return (
    <div className="flex flex-col gap-4 rounded-[20px] bg-white p-5">
      <h2 className="text-[16px] font-extrabold">Endpoint</h2>
      {error ? <InlineStatus tone="error">{error}</InlineStatus> : null}

      <Field id="webhook-url" label="URL" hint="A URL precisa começar com https://" error={urlError}>
        <input
          id="webhook-url"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://sua-api/listacerta/webhook"
          aria-invalid={urlError ? true : undefined}
          aria-describedby={urlError ? "webhook-url-erro" : undefined}
          className={fieldInputClass}
        />
      </Field>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-[13px] font-bold">Eventos</legend>
        <div className="flex flex-wrap gap-2">
          {WEBHOOK_EVENTS.map((e) => (
            <label key={e} className={`rounded-botao border-tinta inline-flex min-h-11 cursor-pointer items-center border-[1.5px] px-3 text-[12px] font-extrabold ${events.includes(e) ? "bg-tinta text-papel" : ""} has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-verde-fundo`}>
              <input type="checkbox" className="sr-only" checked={events.includes(e)} onChange={() => toggleEvent(e)} />
              {EVENT_LABEL[e]}
            </label>
          ))}
        </div>
      </fieldset>

      {endpoint || justCreatedSecret ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-bold">Segredo HMAC</span>
          {displaySecret ? (
            <>
              <p className="text-texto-2 text-[13px] font-bold">Copie agora: este segredo {endpoint ? "" : "não será mostrado de novo neste formulário depois de concluir"}.</p>
              <code className="bg-tinta text-papel rounded-campo block overflow-x-auto p-3 text-[13px] font-bold">{displaySecret}</code>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(displaySecret);
                    setCopied(true);
                  }}
                  className="border-tinta rounded-botao h-10 w-fit border-[1.5px] px-4 text-[13px] font-extrabold"
                >
                  {copied ? "Copiado" : "Copiar"}
                </button>
                {justCreatedSecret && !endpoint ? (
                  <button type="button" onClick={concludeCreate} className="bg-tinta text-papel rounded-botao h-11 w-fit px-4 text-[13px] font-extrabold">
                    Já copiei
                  </button>
                ) : null}
                {endpoint ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setJustCreatedSecret(null);
                        setRevealedSecret(null);
                        setCopied(false);
                      }}
                      className="bg-tinta text-papel rounded-botao h-10 w-fit px-4 text-[13px] font-extrabold"
                    >
                      Ocultar
                    </button>
                    <button type="button" onClick={rotate} className="text-verde-fundo inline-flex min-h-11 items-center text-[13px] font-extrabold underline">
                      {confirmingRotate ? "Confirmar rotação (invalida o segredo atual)" : "Rotacionar"}
                    </button>
                    {confirmingRotate ? (
                      <button type="button" onClick={() => setConfirmingRotate(false)} className="text-texto-3 inline-flex min-h-11 items-center text-[13px] font-bold underline">
                        Cancelar
                      </button>
                    ) : null}
                  </>
                ) : null}
              </div>
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <code className="bg-campo rounded-campo px-3 py-2 text-[13px] font-bold">whsec_••••••••</code>
              <button type="button" onClick={reveal} className="text-verde-fundo inline-flex min-h-11 items-center text-[13px] font-extrabold underline">
                Revelar
              </button>
              <button type="button" onClick={rotate} className="text-verde-fundo inline-flex min-h-11 items-center text-[13px] font-extrabold underline">
                {confirmingRotate ? "Confirmar rotação (invalida o segredo atual)" : "Rotacionar"}
              </button>
              {confirmingRotate ? (
                <button type="button" onClick={() => setConfirmingRotate(false)} className="text-texto-3 inline-flex min-h-11 items-center text-[13px] font-bold underline">
                  Cancelar
                </button>
              ) : null}
            </div>
          )}
          <p className="text-texto-3 text-[12px] font-semibold">Assinatura no cabeçalho x-listacerta-signature. Reenvio com backoff por até 24 h.</p>
        </div>
      ) : null}

      {justCreatedSecret ? null : (
        <div className="flex flex-col gap-2">
          <Button loading={pending} disabled={url.length === 0 || events.length === 0 || Boolean(urlError)} onClick={submit} className="w-fit">
            {endpoint ? "Salvar" : "Criar endpoint"}
          </Button>
          {disabledReason ? <p className="text-texto-2 text-[13px] font-semibold">{disabledReason}</p> : null}
        </div>
      )}
    </div>
  );
}
