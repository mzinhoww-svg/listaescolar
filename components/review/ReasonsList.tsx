import { reasonPhrase } from "@/features/review/phrases";

/** Motivos que levaram o envio à revisão (códigos da S09 traduzidos em frases fixas). */
export function ReasonsList({ reasons }: { reasons: readonly string[] }) {
  if (reasons.length === 0) return null;
  return (
    <section aria-labelledby="motivos-revisao" className="bg-campo rounded-campo px-4 py-3">
      <h3 id="motivos-revisao" className="text-[14px] font-extrabold">Por que foi para a revisão</h3>
      <ul className="mt-1 list-disc pl-5 text-[14px] font-semibold">
        {reasons.map((r) => <li key={r}>{reasonPhrase(r)}</li>)}
      </ul>
    </section>
  );
}
