type Props = { items: readonly { title: string; text: string }[] };

export function Faq({ items }: Props) {
  return (
    <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 md:gap-4">
      {items.map((i) => (
        <details key={i.title} className="bg-papel rounded-card group min-w-0">
          <summary className="focus-visible:outline-verde-fundo flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 rounded-card px-5 py-4 focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden">
            <span className="min-w-0">
              <span className="block text-base font-extrabold">{i.title}</span>
              <span aria-hidden className="text-texto-2 mt-0.5 block truncate text-[13px] font-medium group-open:hidden">
                {i.text}
              </span>
            </span>
            <span aria-hidden className="text-tinta text-xl transition-transform group-open:rotate-45 motion-reduce:transition-none">
              +
            </span>
          </summary>
          <p className="text-texto-2 px-5 pb-4 text-[15px] leading-relaxed">{i.text}</p>
        </details>
      ))}
    </div>
  );
}
