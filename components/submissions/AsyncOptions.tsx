"use client";

import { useActionState, useState } from "react";

import { setNotifyAction } from "@/app/enviar-lista/[submissionId]/actions";
import type { NotifyState } from "@/features/submissions/form-schema";

const idle: NotifyState = { status: "idle" };
const light =
  "border-papel text-papel flex h-[52px] w-full items-center justify-center rounded-botao border-[1.5px] text-base font-extrabold disabled:opacity-60";

/**
 * Estado assíncrono: "continuar aguardando", aviso pelo navegador (só registra a preferência; Web Push é da S11)
 * e canal opcional (e-mail ou WhatsApp).
 */
export function AsyncOptions({ submissionId }: { submissionId: string }) {
  const [waiting, setWaiting] = useState(false);
  const [state, action, pending] = useActionState(setNotifyAction, idle);
  const askBrowserPermission = () => {
    // Melhor esforço: o aviso real é da S11; aqui só pedimos a permissão e registramos a preferência.
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission().catch(() => undefined);
    }
  };
  return (
    <section aria-label="Enquanto a leitura termina" className="flex flex-col gap-3">
      <p className="text-papel/80 text-sm leading-[1.4] font-semibold">
        A leitura está demorando mais que o normal. Você pode continuar aguardando ou pedir um aviso.
      </p>
      <button type="button" onClick={() => setWaiting(true)} className={light}>
        Continuar aguardando
      </button>
      {waiting ? (
        <p className="text-verde-certo text-sm font-bold">Seguimos aguardando. Esta página atualiza sozinha.</p>
      ) : null}
      <form action={action}>
        <input type="hidden" name="submissionId" value={submissionId} />
        <input type="hidden" name="channel" value="browser" />
        <button type="submit" onClick={askBrowserPermission} disabled={pending} className={light}>
          Ativar notificação do navegador
        </button>
      </form>
      <form action={action} className="flex flex-col gap-2">
        <input type="hidden" name="submissionId" value={submissionId} />
        <label htmlFor="notify-channel" className="text-papel/80 text-[13px] font-semibold">
          Ou avise por (opcional)
        </label>
        <div className="flex gap-2">
          <select
            id="notify-channel"
            name="channel"
            defaultValue="email"
            className="bg-papel text-tinta h-12 rounded-campo px-3 text-sm font-bold"
          >
            <option value="email">E-mail</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
          <input
            name="target"
            aria-label="E-mail ou WhatsApp para o aviso"
            autoComplete="off"
            className="bg-papel text-tinta h-12 min-w-0 flex-1 rounded-campo px-3 text-sm font-semibold"
          />
        </div>
        <button type="submit" disabled={pending} className={light}>
          Avisar por este canal
        </button>
      </form>
      <div aria-live="polite">
        {state.status === "saved" ? (
          <p className="text-verde-certo text-sm font-bold">
            {state.channel === "browser"
              ? "Preferência registrada. O aviso pelo navegador ainda será ativado; volte aqui para ver o resultado."
              : "Canal registrado. Vamos avisar quando a leitura terminar."}
          </p>
        ) : null}
        {state.status === "error" ? (
          <p role="alert" className="text-sm font-bold text-[#ffb4a8]">
            {state.message}
          </p>
        ) : null}
      </div>
    </section>
  );
}
