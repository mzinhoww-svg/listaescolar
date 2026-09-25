import { closeLostAction, declareSaleAction, updateLeadStatusAction } from "@/features/leads/actions";
import { CLOSE_REASON_LABEL, CLOSE_REASONS, canTransition, type LeadStatus } from "@/features/leads/state";

const btn = "bg-tinta text-papel rounded-botao h-12 px-5 text-[14px] font-extrabold";
const btnOutline = "border-tinta text-tinta rounded-botao h-12 border-[1.5px] px-5 text-[14px] font-extrabold";
const input = "bg-campo rounded-campo h-12 min-w-0 flex-1 px-4 text-[14px] font-semibold";

/** Registrar resultado (Pap03). Só oferece o que a máquina de estados permite a partir do status atual. */
export function StatusForm({ code, status }: { code: string; status: LeadStatus }) {
  const can = (to: LeadStatus) => canTransition("stationery", status, to);
  const simple = (to: "in_progress" | "awaiting_customer", label: string) =>
    can(to) ? (
      <form action={updateLeadStatusAction}>
        <input type="hidden" name="code" value={code} />
        <input type="hidden" name="to" value={to} />
        <button type="submit" className={btnOutline}>{label}</button>
      </form>
    ) : null;
  return (
    <section className="rounded-card flex flex-col gap-4 bg-white p-5" aria-label="Registrar resultado">
      <h2 className="text-[17px] font-extrabold">Registrar resultado</h2>
      <div className="flex flex-wrap gap-2">
        {simple("in_progress", "Em atendimento")}
        {simple("awaiting_customer", "Aguardando cliente")}
      </div>
      {can("quote_sent") ? (
        <form action={updateLeadStatusAction} className="flex gap-2">
          <input type="hidden" name="code" value={code} />
          <input type="hidden" name="to" value="quote_sent" />
          <input name="amount" inputMode="decimal" placeholder="Valor (opcional)" aria-label="Valor do orçamento (opcional)" className={input} />
          <button type="submit" className={btn}>Orçamento enviado</button>
        </form>
      ) : null}
      {can("converted") ? (
        <form action={declareSaleAction} className="flex gap-2">
          <input type="hidden" name="code" value={code} />
          <input name="amount" inputMode="decimal" placeholder="Valor (opcional)" aria-label="Valor da venda (opcional)" className={input} />
          <button type="submit" className={btn}>Vendi</button>
        </form>
      ) : null}
      {can("declined") ? (
        <form action={closeLostAction} className="flex gap-2">
          <input type="hidden" name="code" value={code} />
          <select name="reason" required defaultValue="" aria-label="Motivo" className={input}>
            <option value="" disabled>Motivo</option>
            {CLOSE_REASONS.map((r) => (
              <option key={r} value={r}>{CLOSE_REASON_LABEL[r]}</option>
            ))}
          </select>
          <button type="submit" className={btnOutline}>Não fechou</button>
        </form>
      ) : null}
      <p className="text-texto-3 text-[12px] font-semibold">
        “Vendi” registra uma venda declarada por você; a ListaCerta não a confirma. Contestação, confirmação do responsável e créditos ainda não existem nesta fase.
      </p>
    </section>
  );
}
