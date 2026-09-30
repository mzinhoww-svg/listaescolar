import Link from "next/link";

import { formatBrl } from "@/features/billing/money";
import type { InvoiceView } from "@/features/billing/ports";

const STATUS_LABEL: Record<InvoiceView["status"], string> = { open: "Aberta", paid: "Paga", cancelled: "Cancelada" };

/** Faturas e recibos da plataforma (Pap06): abertas, pagas e canceladas, com as parcelas do passe. Nenhuma nota fiscal. */
export function InvoiceList({ invoices }: { invoices: readonly InvoiceView[] }) {
  if (invoices.length === 0) {
    return (
      <div className="rounded-card bg-white p-8 text-center" data-testid="invoices-empty">
        <p className="text-[16px] font-extrabold">Nenhuma fatura ainda</p>
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-2" data-testid="invoice-list">
      {invoices.map((inv) => (
        <li key={inv.id} className="rounded-card flex flex-wrap items-center justify-between gap-2 bg-white p-4">
          <div>
            <p className="text-[14px] font-extrabold">
              {inv.kind === "credit_package" ? "Pacote de crédito" : `Passe de temporada · parcela ${inv.installmentNo}`}
              {inv.isDemo ? <span className="text-verde-fundo"> · demonstração</span> : null}
            </p>
            <p className="text-texto-3 text-[12px] font-semibold">Vencimento {inv.dueDate}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[14px] font-extrabold">{formatBrl(inv.amountCents)}</span>
            <span className="text-texto-2 text-[12px] font-extrabold uppercase">{STATUS_LABEL[inv.status]}</span>
            <Link href={`/papelaria/creditos/faturas/${inv.id}`} className="text-verde-fundo inline-flex min-h-11 min-w-11 items-center justify-center text-[13px] font-extrabold underline">
              Ver
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
