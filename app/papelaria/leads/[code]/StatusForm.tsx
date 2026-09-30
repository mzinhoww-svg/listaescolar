import { SubmitButton } from "@/components/cart/SubmitButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field, fieldInputClass } from "@/components/ui/Field";
import { closeLostAction, declareSaleAction, updateLeadStatusAction } from "@/features/leads/actions";
import { CLOSE_REASON_LABEL, CLOSE_REASONS, canTransition, type LeadStatus } from "@/features/leads/state";

/** Passo simples e reversível (sem efeito para a família além do status): envia direto. */
function StepButton({ code, to, label }: { code: string; to: "in_progress" | "awaiting_customer"; label: string }) {
  return (
    <form action={updateLeadStatusAction}>
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="to" value={to} />
      <SubmitButton variant="outline" pendingLabel="Salvando">{label}</SubmitButton>
    </form>
  );
}

/**
 * Registrar resultado (Pap03). Só oferece o que a máquina de estados permite a partir do status atual.
 * Orçamento, venda e "não fechou" têm efeito para a família e para a cobrança: passam por `ConfirmDialog` com o efeito escrito (UX-076).
 * O orçamento pede o valor (a família lê esse valor); "Responder sem valor" é um caminho explícito à parte (UX-074).
 */
export function StatusForm({ code, status }: { code: string; status: LeadStatus }) {
  const can = (to: LeadStatus) => canTransition("stationery", status, to);
  const hidden = { code };
  const nextIsSale = status === "quote_sent" || status === "awaiting_customer";
  return (
    <section className="rounded-card flex flex-col gap-4 bg-white p-5" aria-label="Registrar resultado">
      <h2 className="text-[17px] font-extrabold">Registrar resultado</h2>
      {can("in_progress") || can("awaiting_customer") ? (
        <div className="flex flex-wrap gap-2">
          {can("in_progress") ? <StepButton code={code} to="in_progress" label="Marcar em atendimento" /> : null}
          {can("awaiting_customer") ? <StepButton code={code} to="awaiting_customer" label="Marcar aguardando a família" /> : null}
        </div>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {can("quote_sent") ? (
          <>
            <ConfirmDialog
              triggerLabel="Enviar orçamento"
              triggerStyle="button"
              triggerVariant={nextIsSale ? "outline" : "primary"}
              confirmVariant="primary"
              title="Enviar o orçamento à família?"
              confirmLabel="Enviar orçamento"
              action={updateLeadStatusAction}
              hidden={{ ...hidden, to: "quote_sent" }}
              body={
                <div className="flex flex-col gap-3">
                  <p>A família verá este valor no pedido {code}. Para corrigir depois, marque “aguardando a família” e envie o orçamento de novo.</p>
                  <Field id={`orc-${code}`} label="Valor do orçamento (R$)" hint="Use o formato 1.234,50.">
                    <input id={`orc-${code}`} name="amount" required inputMode="decimal" autoComplete="off" className={fieldInputClass} />
                  </Field>
                </div>
              }
            />
            <ConfirmDialog
              triggerLabel="Responder sem valor"
              triggerStyle="button"
              triggerVariant="outline"
              confirmVariant="primary"
              title="Responder sem informar valor?"
              confirmLabel="Responder sem valor"
              action={updateLeadStatusAction}
              hidden={{ ...hidden, to: "quote_sent", withoutValue: "1" }}
              body={<p>A família vai ver que você respondeu sem informar valor e que deve falar com você pelo WhatsApp. Nenhum preço é mostrado.</p>}
            />
          </>
        ) : null}
        {can("converted") ? (
          <ConfirmDialog
            triggerLabel="Registrar venda"
            triggerStyle="button"
            triggerVariant={nextIsSale ? "primary" : "outline"}
            confirmVariant="primary"
            title="Registrar venda?"
            confirmLabel="Registrar venda"
            action={declareSaleAction}
            hidden={hidden}
            body={
              <div className="flex flex-col gap-3">
                <p>Você declara que vendeu este pedido. O pedido é encerrado e a venda pode gerar cobrança à papelaria. Se algo estiver errado, dá para contestar em até 72 h depois do pedido.</p>
                <Field id={`venda-${code}`} label="Valor da venda (opcional)" hint="Se não informar, fica “indisponível”.">
                  <input id={`venda-${code}`} name="amount" inputMode="decimal" autoComplete="off" className={fieldInputClass} />
                </Field>
              </div>
            }
          />
        ) : null}
        {can("declined") ? (
          <ConfirmDialog
            triggerLabel="Registrar que não fechou"
            triggerStyle="button"
            triggerVariant="outline"
            confirmVariant="primary"
            title="Registrar que não fechou?"
            confirmLabel="Registrar que não fechou"
            action={closeLostAction}
            hidden={hidden}
            body={
              <div className="flex flex-col gap-3">
                <p>O pedido é encerrado e não recebe novas ações. Isso não pode ser desfeito.</p>
                <Field id={`motivo-${code}`} label="Motivo">
                  <select id={`motivo-${code}`} name="reason" required defaultValue="" className={fieldInputClass}>
                    <option value="" disabled>Escolha o motivo</option>
                    {CLOSE_REASONS.map((r) => (
                      <option key={r} value={r}>{CLOSE_REASON_LABEL[r]}</option>
                    ))}
                  </select>
                </Field>
              </div>
            }
          />
        ) : null}
      </div>
      <p className="text-texto-3 text-[13px] font-semibold">
        A venda só fica confirmada quando pelo menos duas de três partes concordam: você, a família e o Pix pela plataforma (quando existir).
      </p>
    </section>
  );
}
