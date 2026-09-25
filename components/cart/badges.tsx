export function DemoBadge() {
  return (
    <span className="bg-campo text-texto-2 rounded-botao inline-flex w-fit items-center px-2.5 py-1 text-[11px] font-extrabold whitespace-nowrap">
      Demonstração
    </span>
  );
}

export function AffiliateBadge() {
  return (
    <span className="bg-verde-certo/25 text-verde-fundo rounded-botao inline-flex w-fit items-center px-2.5 py-1 text-[11px] font-extrabold whitespace-nowrap">
      link afiliado
    </span>
  );
}

export function Tag({ children, tone = "green" }: { children: string; tone?: "green" | "muted" }) {
  const cls = tone === "green" ? "bg-verde-certo text-tinta" : "bg-campo text-texto-2";
  return (
    <span
      className={`${cls} rounded-botao inline-flex w-fit items-center px-2.5 py-1 text-[11px] font-extrabold whitespace-nowrap`}
    >
      {children}
    </span>
  );
}

export function PriceNotice() {
  return (
    <p className="bg-campo text-texto-2 rounded-campo px-3 py-3 text-xs leading-[1.4] font-semibold">
      Preço e estoque podem mudar. Confira na loja antes de comprar.
    </p>
  );
}

export function StoreMark({ initials, dark = false }: { initials: string; dark?: boolean }) {
  return (
    <div
      aria-hidden
      className={`${dark ? "bg-tinta text-papel" : "bg-campo text-tinta"} flex size-11 shrink-0 items-center justify-center rounded-2xl text-xs font-extrabold`}
    >
      {initials}
    </div>
  );
}
