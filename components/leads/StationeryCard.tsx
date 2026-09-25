import Link from "next/link";

import { moneyOrUnavailable, formatWhen } from "./format";
import { DemoSeal } from "./StatusBadge";
import type { QuoteOptionView } from "@/features/leads/queries";

const PAY: Record<string, string> = { pix: "Pix", cash: "Dinheiro", debit_card: "Cartão de débito", credit_card: "Cartão de crédito", boleto: "Boleto" };

/** Cartão de papelaria (App21): só dado real; sem distância, prazo, nota, selo nem parcelamento inventados. */
export function StationeryCard({ option, selectHref }: { option: QuoteOptionView; selectHref: string }) {
  const e = option.estimate;
  const modes = [option.offersDelivery ? "Entrega" : null, option.offersPickup ? "Retirada" : null].filter(Boolean).join(" · ");
  return (
    <li className="rounded-card flex flex-col gap-3 bg-white p-5" data-testid="stationery-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[17px] font-extrabold">{option.name}</h2>
          <p className="text-texto-3 text-[13px] font-semibold">
            {option.neighborhood ?? "bairro não informado"} · {modes || "entrega/retirada não informada"}
          </p>
        </div>
        {option.isDemo ? <DemoSeal /> : null}
      </div>
      <p className="text-texto-2 text-[13px] font-semibold">
        Pagamento: {option.paymentMethods.length > 0 ? option.paymentMethods.map((m) => PAY[m] ?? m).join(", ") : "não informado"}
      </p>
      <p className="text-[14px] font-bold" data-testid="stationery-estimate">
        {e.status === "unavailable" ? (
          "Estimativa: indisponível (sem preço informado no catálogo)"
        ) : (
          <>
            Estimativa pelo catálogo da papelaria: {moneyOrUnavailable(e.subtotalCents)}
            <span className="text-texto-3 block text-[12px] font-semibold">
              {e.pricedCount} de {e.totalCount} itens com preço · origem: informado pela papelaria{e.asOf ? ` · ${formatWhen(e.asOf)}` : ""}
            </span>
          </>
        )}
      </p>
      <Link
        href={selectHref}
        className="bg-verde-certo text-tinta rounded-botao flex h-12 items-center justify-center text-[15px] font-extrabold"
        aria-label={`Pedir pelo WhatsApp a ${option.name}`}
      >
        Pedir pelo WhatsApp
      </Link>
    </li>
  );
}
