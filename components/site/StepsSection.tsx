type Props = { items: readonly { title: string; text: string }[] };

export function StepsSection({ items }: Props) {
  return (
    <ol className="grid gap-4 md:grid-cols-3">
      {items.map((s, i) => (
        <li key={s.title} className="bg-white rounded-card flex gap-4 p-6 md:flex-col">
          <span aria-hidden className="bg-tinta text-papel flex size-10 shrink-0 items-center justify-center rounded-full text-base font-extrabold">
            {i + 1}
          </span>
          <div>
            <h3 className="text-lg font-extrabold">{s.title}</h3>
            <p className="text-texto-2 mt-1 text-[15px] leading-relaxed">{s.text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
