type Props = { items: readonly { title: string; text: string }[] };

export function Faq({ items }: Props) {
  return (
    <div className="flex max-w-[720px] flex-col gap-2.5">
      {items.map((i) => (
        <details key={i.title} className="bg-white rounded-campo group">
          <summary className="focus-visible:outline-verde-fundo flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 rounded-campo px-5 py-3 text-base font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden">
            {i.title}
            <span aria-hidden className="text-verde-fundo text-xl transition-transform group-open:rotate-45 motion-reduce:transition-none">
              +
            </span>
          </summary>
          <p className="text-texto-2 px-5 pb-4 text-[15px] leading-relaxed">{i.text}</p>
        </details>
      ))}
    </div>
  );
}
