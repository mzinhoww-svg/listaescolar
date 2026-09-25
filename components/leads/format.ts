import { formatBRL } from "@/features/cart/money";
import type { LeadEventRow } from "@/features/leads/repository";
import { LEAD_STATUS_LABEL } from "@/features/leads/state";

const dateFmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Cuiaba" });
export const formatWhen = (d: Date): string => dateFmt.format(d);

/** Dinheiro só quando há valor; senão "indisponível" (nunca zero nem estimativa). */
export function moneyOrUnavailable(cents: number | null | undefined): string {
  return typeof cents === "number" && Number.isSafeInteger(cents) && cents >= 0 ? formatBRL(cents) : "indisponível";
}

/** "há 12 min", "há 3 h", "ontem", senão a data. Data futura vira a data absoluta. */
export function relativeWhen(date: Date, now: Date): string {
  const diff = now.getTime() - date.getTime();
  if (!Number.isFinite(diff) || diff < 0) return formatWhen(date);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "ontem" : `há ${d} dias`;
}

export function eventLabel(e: LeadEventRow, side: "stationery" | "requester"): string {
  const to = e.toStatus ? LEAD_STATUS_LABEL[e.toStatus] : null;
  switch (e.eventType) {
    case "created":
      return side === "stationery" ? "Lead enviado pelo responsável" : "Pedido de cotação criado";
    case "viewed":
      return side === "stationery" ? "Você abriu a lista" : "A papelaria abriu a lista";
    case "whatsapp_opened":
      return side === "stationery" ? "Responsável abriu o WhatsApp" : "Você abriu o WhatsApp";
    case "quote_registered":
      return e.amountCents !== null ? `Cotação enviada · ${moneyOrUnavailable(e.amountCents)}` : "Cotação enviada (sem valor informado)";
    case "sale_declared":
      return e.amountCents !== null ? `Venda declarada · ${moneyOrUnavailable(e.amountCents)}` : "Venda declarada (sem valor informado)";
    case "closed_lost":
      return "Não fechou";
    case "cancelled":
      return "Pedido cancelado";
    case "expired":
      return "Pedido expirado";
    default:
      return to ? `Status: ${to}` : "Atualização";
  }
}
