"use client";

import { useRef, useState, type FormEvent } from "react";

import {
  PARTNER_LIVE_RATE_PER_DAY,
  PARTNER_LIVE_RATE_PER_MINUTE,
  PARTNER_TEST_RATE_PER_DAY,
  PARTNER_TEST_RATE_PER_MINUTE,
} from "@/features/b2b/limits";
import { BRAZIL_UFS } from "@/features/b2b/schemas";
import { canTransitionPartner, keysRevokedOnTransition, requiresLiveLimits, requiresReason, requiresSandboxLimits, type B2bPartnerStatus } from "@/features/b2b/states";

import { confirmationFor, labelFor, PLAN_OPTIONS } from "./decision-copy";

// Decisão do admin (Admin15): plano, cobertura, limites `test_*`/`live_*` e motivo aparecem conforme o destino
// (`requiresSandboxLimits`/`requiresLiveLimits`/`requiresReason`) — a validação real é sempre no servidor
// (`DecidePartnerInputSchema`/`b2b_partner_decide`). "use client" só porque os campos aparecem/somem conforme o
// destino escolhido. `action` é a Server Action `decidePartnerAction` de `app/admin/parceiros/actions.ts`.
//
// Confirmação (revisão final do branch): QUALQUER transição que `keysRevokedOnTransition` marque como revogando
// chave — não só suspender/recusar, também `active -> sandbox` (revoga as chaves `live`) — pede confirmação de
// fato antes de enviar. Nada vem pré-selecionado (o admin escolhe a decisão de propósito). O `<form>` intercepta
// o `onSubmit` (cobre clique no botão E o Enter implícito num campo do formulário): se a decisão exige
// confirmação e ainda não foi confirmada, valida os campos (`reportValidity()`, evita abrir o diálogo com campo
// obrigatório vazio) e abre o diálogo em vez de enviar; confirmar marca `bypassRef` e reenvia o mesmo `<form>`.
//
// Valores atuais do parceiro (`plan`/`coverageUfs`/`limits`, de `PartnerOverview`) viram o ponto de partida dos
// campos: aprovar/promover sem editar nada não pode silenciosamente resetar a cobertura para nacional nem os
// limites para o padrão de negócio (revisão final).

const inputCls = "h-11 w-full rounded-campo bg-campo px-3 text-[14px] font-medium text-tinta";
const labelCls = "flex flex-col gap-1.5 text-[13px] font-bold";

type Act = (formData: FormData) => Promise<void>;
type CurrentLimits = { testRatePerMinute: number | null; testRatePerDay: number | null; liveRatePerMinute: number | null; liveRatePerDay: number | null };

type Props = {
  partnerId: string;
  status: B2bPartnerStatus;
  action: Act;
  plan?: string | null;
  coverageUfs?: readonly string[] | null;
  limits?: CurrentLimits;
};

export function DecisionForm({ partnerId, status, action, plan = null, coverageUfs = null, limits }: Props) {
  const options = (["sandbox", "active", "rejected", "suspended"] as const).filter((to) => canTransitionPartner(status, to));
  const [to, setTo] = useState<B2bPartnerStatus | null>(null);
  const [national, setNational] = useState(coverageUfs == null);
  const formRef = useRef<HTMLFormElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const bypassRef = useRef(false);

  if (options.length === 0) return <p className="text-texto-3 text-[13px] font-semibold">Nenhuma transição disponível (estado terminal).</p>;

  const revoked = to ? keysRevokedOnTransition(status, to) : null;
  const confirmation = to ? confirmationFor(to, revoked) : undefined;

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    if (!to) {
      e.preventDefault();
      return;
    }
    if (confirmation && !bypassRef.current) {
      e.preventDefault();
      if (formRef.current?.reportValidity()) dialogRef.current?.showModal();
      return;
    }
    bypassRef.current = false;
  }
  function confirmAndSubmit() {
    dialogRef.current?.close();
    bypassRef.current = true;
    formRef.current?.requestSubmit();
  }

  return (
    <form ref={formRef} action={action} onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-[20px] bg-white p-5">
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
            <select name="plan" required className={inputCls} defaultValue={plan ?? ""}>
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
                    <input type="checkbox" name="coverageUfs" value={uf} defaultChecked={coverageUfs?.includes(uf) ?? false} className="size-3.5" />
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
                defaultValue={limits?.testRatePerMinute ?? PARTNER_TEST_RATE_PER_MINUTE.default}
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
                defaultValue={limits?.testRatePerDay ?? PARTNER_TEST_RATE_PER_DAY.default}
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
              defaultValue={limits?.liveRatePerMinute ?? PARTNER_LIVE_RATE_PER_MINUTE.default}
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
              defaultValue={limits?.liveRatePerDay ?? PARTNER_LIVE_RATE_PER_DAY.default}
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

      <button type="submit" disabled={!to} className="bg-tinta text-papel rounded-botao flex h-12 items-center justify-center text-[15px] font-extrabold disabled:opacity-50">
        {to ? labelFor(status, to) : "Escolha uma decisão"}
      </button>

      <dialog ref={dialogRef} className="m-auto rounded-[20px] bg-white p-0 backdrop:bg-black/40">
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
                className="rounded-botao flex h-11 flex-1 items-center justify-center border-[1.5px] border-erro-texto text-[14px] font-extrabold text-erro-texto"
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
