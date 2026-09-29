import type { DeliveryRow } from "@/features/webhooks/repository";

import { ResendButton } from "./ResendButton";

// Tabela de entregas (B2B05): evento, quando, resposta (status HTTP ou o código do erro), tentativas e
// "Reenviar" (só quando `failed`/`dead`). Sem `"use client"`: só exibe; `ResendButton` cuida da interação.

function formatWhen(v: string): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(v));
}

function responseLabel(d: DeliveryRow): string {
  if (d.lastResponseStatus) return String(d.lastResponseStatus);
  if (d.lastErrorCode === "timeout") return "timeout";
  if (d.lastErrorCode) return d.lastErrorCode;
  return d.status === "queued" ? "—" : "erro";
}

function responseTone(d: DeliveryRow): string {
  if (d.lastResponseStatus && d.lastResponseStatus < 300) return "bg-verde-certo text-tinta";
  if (d.status === "queued" || d.status === "sending") return "bg-campo text-texto-2";
  return "bg-erro-fundo text-erro-texto";
}

export function DeliveriesTable({ deliveries }: { deliveries: readonly DeliveryRow[] }) {
  if (deliveries.length === 0) {
    return <p className="text-texto-2 rounded-[20px] bg-white p-6 text-[15px] font-bold">Nenhuma entrega ainda.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-[20px] bg-white">
      <table className="w-full text-left text-[14px]">
        <thead>
          <tr className="text-texto-3 border-linha border-b text-[12px] uppercase">
            <th className="px-4 py-3 font-extrabold">Evento</th>
            <th className="px-4 py-3 font-extrabold">Quando</th>
            <th className="px-4 py-3 font-extrabold">Resposta</th>
            <th className="px-4 py-3 font-extrabold">Tentativas</th>
            <th className="px-4 py-3 font-extrabold">Ação</th>
          </tr>
        </thead>
        <tbody>
          {deliveries.map((d) => (
            <tr key={d.id} className="border-linha border-b last:border-0">
              <td className="px-4 py-3">
                <span className="bg-campo text-texto-2 rounded-botao px-2.5 py-1 text-[12px] font-extrabold">{d.eventType}</span>
              </td>
              <td className="px-4 py-3">{formatWhen(d.createdAt)}</td>
              <td className="px-4 py-3">
                <span className={`rounded-botao px-2.5 py-1 text-[12px] font-extrabold ${responseTone(d)}`}>{responseLabel(d)}</span>
              </td>
              <td className="px-4 py-3 font-bold">{d.attempts}</td>
              <td className="px-4 py-3">{d.status === "failed" || d.status === "dead" ? <ResendButton deliveryId={d.id} /> : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
