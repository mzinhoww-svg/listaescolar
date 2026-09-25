import { DemoBadge } from "@/components/admin/DemoBadge";
import { SITE_COPY } from "@/features/site/copy";

/** Cartão ilustrativo: conteúdo genérico com selo de demonstração e sem preço. */
export function HeroListCard() {
  const c = SITE_COPY.hero;
  return (
    <div className="bg-white rounded-card border-linha border p-5 shadow-sm md:p-6" aria-label="Exemplo ilustrativo de lista">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-extrabold">{c.cardTitle}</p>
        <DemoBadge />
      </div>
      <p className="text-verde-fundo mt-4 text-xs font-extrabold">{c.cardTag}</p>
      <ul className="mt-2 flex flex-col">
        {c.cardItems.map((i) => (
          <li key={i} className="border-linha flex items-center gap-3 border-b py-2.5 text-[15px] font-semibold last:border-0">
            <span aria-hidden className="border-tinta size-4 shrink-0 rounded border-[1.5px]" />
            {i}
          </li>
        ))}
      </ul>
      <div className="bg-campo rounded-campo mt-3 px-4 py-3">
        <p className="text-sm font-extrabold">{c.cardFoot}</p>
        <p className="text-texto-2 text-xs font-semibold">{c.cardPrice}</p>
      </div>
    </div>
  );
}
