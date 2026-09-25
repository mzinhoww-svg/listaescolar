type Props = { items: readonly { title: string; text: string }[] };

/** Lista numerada da página Sobre: círculos Verde Certo com o número. */
export function AboutSteps({ items }: Props) {
  return (
    <ol className="flex flex-col gap-4">
      {items.map((s, i) => (
        <li key={s.title} className="flex gap-4">
          <span aria-hidden className="bg-verde-certo text-tinta flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-extrabold">
            {i + 1}
          </span>
          <div>
            <h3 className="text-base font-extrabold">{s.title}</h3>
            <p className="text-texto-2 text-[15px] leading-relaxed">{s.text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
