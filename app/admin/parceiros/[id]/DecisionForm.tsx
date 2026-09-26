"use client";

import { useState } from "react";

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

type Act = (formData: FormData) => Promise<void>;

export function DecisionForm({ partnerId, status, action }: { partnerId: string; status: B2bPartnerStatus; action: Act }) {
  const options = (["sandbox", "active", "rejected", "suspended"] as const).filter((to) => canTransitionPartner(status, to));
  const [to, setTo] = useState<B2bPartnerStatus | null>(options[0] ?? null);
  const [national, setNational] = useState(true);

  if (options.length === 0) return <p className="text-texto-3 text-[13px] font-semibold">Nenhuma transição disponível (estado terminal).</p>;

  return (
    <form action={action} className="flex flex-col gap-4 rounded-[20px] bg-white p-5">
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
              <input type="number" name="testRatePerMinute" required min={1} max={10000} defaultValue={60} className={inputCls} />
            </label>
            <label className={labelCls}>
              Sandbox · por dia
              <input type="number" name="testRatePerDay" required min={1} max={10000000} defaultValue={1000} className={inputCls} />
            </label>
          </div>
        </>
      ) : null}

      {to && requiresLiveLimits(to) ? (
        <div className="grid grid-cols-2 gap-3">
          <label className={labelCls}>
            Produção · por minuto
            <input type="number" name="liveRatePerMinute" required min={1} max={10000} defaultValue={60} className={inputCls} />
          </label>
          <label className={labelCls}>
            Produção · por dia
            <input type="number" name="liveRatePerDay" required min={1} max={10000000} defaultValue={2000} className={inputCls} />
          </label>
        </div>
      ) : null}

      {to && requiresReason(to) ? (
        <label className={labelCls}>
          Motivo {to === "suspended" ? '("Suspender uma conta revoga as chaves na hora")' : ""}
          <textarea name="reason" required minLength={1} maxLength={500} rows={3} className="bg-campo rounded-campo w-full p-3 text-[14px] font-medium" />
        </label>
      ) : null}

      <button type="submit" disabled={!to} className="bg-tinta text-papel rounded-botao flex h-12 items-center justify-center text-[15px] font-extrabold disabled:opacity-50">
        {to ? labelFor(status, to) : "Escolha uma decisão"}
      </button>
    </form>
  );
}
