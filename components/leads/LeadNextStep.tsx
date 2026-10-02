import { leadNextStep } from "@/features/leads/next-step";
import type { LeadStatus } from "@/features/leads/state";

/** Faixa com o próximo passo da família, logo abaixo do resumo do pedido. */
export function LeadNextStep({ status }: { status: LeadStatus }) {
  const s = leadNextStep(status);
  return (
    <div role="status" className="bg-branco-tonal rounded-card flex flex-col gap-1 p-5">
      <p className="text-[15px] font-extrabold">{s.title}</p>
      <p className="text-texto-2 text-[14px] leading-relaxed font-medium">{s.body}</p>
    </div>
  );
}
