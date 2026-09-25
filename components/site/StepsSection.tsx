type Props = { items: readonly { title: string; text: string }[] };

export function StepsSection({ items }: Props) {
  return (
    <ol className="grid gap-4 md:grid-cols-3">
      {items.map((s, i) => (
        <li key={s.title} className="bg-white rounded-card flex flex-col gap-2 p-6">
          <span aria-hidden className="text-verde-fundo text-[40px] leading-none font-extrabold">
            {i + 1}
          </span>
          <h3 className="text-lg font-extrabold">{s.title}</h3>
          <p className="text-texto-2 text-[15px] leading-relaxed">{s.text}</p>
        </li>
      ))}
    </ol>
  );
}
