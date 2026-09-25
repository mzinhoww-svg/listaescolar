import { DemoBadge } from "@/components/admin/DemoBadge";

type Screen = { head: string; sub: string; items: readonly string[]; foot: string };

/** Celular ilustrativo: conteúdo genérico, selo de demonstração e nenhum preço. */
export function PhoneMock({ screen, label }: { screen: Screen; label: string }) {
  return (
    <figure aria-label={label} className="bg-tinta mx-auto w-full max-w-[300px] rounded-[36px] p-2.5">
      <div className="bg-papel rounded-[28px] p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[13px] font-extrabold">{screen.head}</p>
          <DemoBadge />
        </div>
        <p className="text-verde-fundo mt-3 text-xs font-extrabold">{screen.sub}</p>
        <ul className="mt-1.5 flex flex-col">
          {screen.items.map((i) => (
            <li key={i} className="border-linha border-b py-2 text-sm font-semibold last:border-0">
              {i}
            </li>
          ))}
        </ul>
        <p className="text-texto-2 mt-3 text-xs font-semibold">{screen.foot}</p>
      </div>
    </figure>
  );
}
