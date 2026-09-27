"use client";

import { useRef, useState } from "react";

import {
  PARTNER_LIVE_RATE_PER_DAY,
  PARTNER_LIVE_RATE_PER_MINUTE,
  PARTNER_TEST_RATE_PER_DAY,
  PARTNER_TEST_RATE_PER_MINUTE,
} from "@/features/b2b/limits";
import { BRAZIL_UFS } from "@/features/b2b/schemas";
import { canTransitionPartner, requiresLiveLimits, requiresReason, requiresSandboxLimits, type B2bPartnerStatus } from "@/features/b2b/states";

// Decisão do admin (Admin15): plano, cobertura, limites `test_*`/`live_*` e motivo aparecem conforme o destino
// (`requiresSandboxLimits`/`requiresLiveLimits`/`requiresReason`) — a validação real é sempre no servidor
// (`DecidePartnerInputSchema`/`b2b_partner_decide`). "use client" só porque os campos aparecem/somem conforme o
// destino escolhido. `action` é a Server Action `decidePartnerAction` de `app/admin/parceiros/actions.ts`, presa
// direto no `<form>` (sem `useActionState`: o redirect + `?erro=`/`?ok=1` é lido pela página, como em `/admin/*`).

function labelFor(from: B2bPartnerStatus, to: B2bPartnerStatus): string {
  if (to === "rejected") return "Recusar";
  if (to === "suspended") return "Suspender";
  if (from === "suspended") return to === "active" ? "Reativar em produção" : "Reativar em sandbox";
  if (from === "active" && to === "sandbox") return "Rebaixar para sandbox";
  return to === "active" ? "Aprovar em produção" : "Aprovar em sandbox";
}
const PLAN_OPTIONS = [
  { value: "sandbox", label: "Sandbox" },
  { value: "regional", label: "Regional" },
  { value: "national", label: "Nacional" },
  { value: "brand_campaigns", label: "Campanhas de marca" },
  { value: "edtech_integration", label: "Integração EdTech" },
] as const;

const inputCls = "h-11 w-full rounded-campo bg-campo px-3 text-[14px] font-medium text-tinta";
const labelCls = "flex flex-col gap-1.5 text-[13px] font-bold";

// Decisões irreversíveis (ou de efeito imediato sobre chaves) pedem confirmação de fato, não só um aviso entre
// aspas dentro do rótulo do motivo (revisão de segurança da Task 3, Important #2). Texto do design ("Suspender uma
// conta revoga as chaves na hora") vira o corpo da confirmação.
const CONFIRM_TEXT: Partial<Record<B2bPartnerStatus, { title: string; body: string; confirm: string }>> = {
  suspended: {
    title: "Suspender parceiro",
    body: "Suspender uma conta revoga as chaves na hora: as chaves ativas param de funcionar imediatamente. Reativar depois não devolve essas chaves — o parceiro precisa emitir novas.",
    confirm: "Suspender agora",
  },
  rejected: {
    title: "Recusar cadastro",
    body: "Recusar é definitivo para esta solicitação (estado terminal). O motivo registrado abaixo fica visível ao parceiro.",
    confirm: "Recusar agora",
  },
};

type Act = (formData: FormData) => Promise<void>;

export function DecisionForm({ partnerId, status, action }: { partnerId: string; status: B2bPartnerStatus; action: Act }) {
  const options = (["sandbox", "active", "rejected", "suspended"] as const).filter((to) => canTransitionPartner(status, to));
  const [to, setTo] = useState<B2bPartnerStatus | null>(options[0] ?? null);
  const [national, setNational] = useState(true);
  const formRef = useRef<HTMLFormElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  if (options.length === 0) return <p className="text-texto-3 text-[13px] font-semibold">Nenhuma transição disponível (estado terminal).</p>;

  const confirmation = to ? CONFIRM_TEXT[to] : undefined;
  function trigger() {
    if (confirmation) dialogRef.current?.showModal();
    else formRef.current?.requestSubmit();
  }
  function confirmAndSubmit() {
    dialogRef.current?.close();
    formRef.current?.requestSubmit();
  }

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-4 rounded-[20px] bg-white p-5">
      <input type="hidden" name="partnerId" value={partnerId} />
      <fieldset className="flex flex-col gap-2">
        <legend className="text-[13px] font-bold">Decisão</legend>
        {options.map((o) => (
          <label key={o} className="flex items-center gap-2 text-[14px] font-semibold">
            <input type="radio" name="to" value={o} checked={to === o} onChange={() => setTo(o)} />
            {labelFor(status, o)}
          </label>
        ))}
      </fieldset>

      {to && requiresSandboxLimits(to) ? (
        <>
          <label className={labelCls}>
            Plano
            <select name="plan" required className={inputCls} defaultValue="">
              <option value="" disabled>
                Escolha o plano
              </option>
              {PLAN_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-[13px] font-bold">Cobertura</legend>
            <label className="flex items-center gap-2 text-[13px] font-semibold">
              <input type="checkbox" name="national" checked={national} onChange={(e) => setNational(e.target.checked)} />
              Nacional
            </label>
            {national ? null : (
              <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-9">
                {BRAZIL_UFS.map((uf) => (
                  <label key={uf} className="bg-campo rounded-campo flex h-9 items-center justify-center gap-1 text-[12px] font-bold">
                    <input type="checkbox" name="coverageUfs" value={uf} className="size-3.5" />
                    {uf}
                  </label>
                ))}
              </div>
            )}
          </fieldset>
          <div className="grid grid-cols-2 gap-3">
            <label className={labelCls}>
              Sandbox · por minuto
              <input
                type="number"
                name="testRatePerMinute"
                required
                min={PARTNER_TEST_RATE_PER_MINUTE.min}
                max={PARTNER_TEST_RATE_PER_MINUTE.max}
                defaultValue={PARTNER_TEST_RATE_PER_MINUTE.default}
                className={inputCls}
              />
            </label>
            <label className={labelCls}>
              Sandbox · por dia
              <input
                type="number"
                name="testRatePerDay"
                required
                min={PARTNER_TEST_RATE_PER_DAY.min}
                max={PARTNER_TEST_RATE_PER_DAY.max}
                defaultValue={PARTNER_TEST_RATE_PER_DAY.default}
                className={inputCls}
              />
            </label>
          </div>
        </>
      ) : null}

      {to && requiresLiveLimits(to) ? (
        <div className="grid grid-cols-2 gap-3">
          <label className={labelCls}>
            Produção · por minuto
            <input
              type="number"
              name="liveRatePerMinute"
              required
              min={PARTNER_LIVE_RATE_PER_MINUTE.min}
              max={PARTNER_LIVE_RATE_PER_MINUTE.max}
              defaultValue={PARTNER_LIVE_RATE_PER_MINUTE.default}
              className={inputCls}
            />
          </label>
          <label className={labelCls}>
            Produção · por dia
            <input
              type="number"
              name="liveRatePerDay"
              required
              min={PARTNER_LIVE_RATE_PER_DAY.min}
              max={PARTNER_LIVE_RATE_PER_DAY.max}
              defaultValue={PARTNER_LIVE_RATE_PER_DAY.default}
              className={inputCls}
            />
          </label>
        </div>
      ) : null}

      {to && requiresReason(to) ? (
        <label className={labelCls}>
          Motivo
          <textarea name="reason" required minLength={1} maxLength={500} rows={3} className="bg-campo rounded-campo w-full p-3 text-[14px] font-medium" />
        </label>
      ) : null}

      <button type="button" onClick={trigger} disabled={!to} className="bg-tinta text-papel rounded-botao flex h-12 items-center justify-center text-[15px] font-extrabold disabled:opacity-50">
        {to ? labelFor(status, to) : "Escolha uma decisão"}
      </button>

      <dialog ref={dialogRef} className="rounded-[20px] bg-white p-0 backdrop:bg-black/40">
        {confirmation ? (
          <div className="flex w-[min(92vw,420px)] flex-col gap-4 p-6">
            <h2 className="text-[18px] font-extrabold">{confirmation.title}</h2>
            <p className="text-texto-2 text-[14px] font-semibold">{confirmation.body}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                className="border-tinta rounded-botao flex h-11 flex-1 items-center justify-center border-[1.5px] text-[14px] font-extrabold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmAndSubmit}
                className="rounded-botao flex h-11 flex-1 items-center justify-center border-[1.5px] border-[#8a1c14] text-[14px] font-extrabold text-[#8a1c14]"
              >
                {confirmation.confirm}
              </button>
            </div>
          </div>
        ) : null}
      </dialog>
    </form>
  );
}
