/** Bloco de espera (S28, M07): cor `campo`, altura reservada para não deslocar o layout; pulso desligado com movimento reduzido. */
export function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`bg-campo rounded-card animate-pulse motion-reduce:animate-none ${className}`} />;
}

type Props = {
  /** Texto lido por leitor de tela e visível só para ele; o padrão é "Carregando…". */
  label?: string;
  /** Alturas (classes Tailwind) dos blocos, de cima para baixo. Reserva o espaço do conteúdo real. */
  blocks?: readonly string[];
  className?: string;
};

/** Esqueleto de página: `role="status"`, sem spinner de tela cheia. */
export function Skeleton({ label = "Carregando…", blocks = ["h-10 w-2/3", "h-40", "h-40"], className = "" }: Props) {
  return (
    <div role="status" aria-busy="true" className={`mx-auto flex w-full max-w-[420px] flex-col gap-4 px-6 py-8 ${className}`}>
      <span className="sr-only">{label}</span>
      {blocks.map((b, i) => (
        <SkeletonBlock key={i} className={b} />
      ))}
    </div>
  );
}
