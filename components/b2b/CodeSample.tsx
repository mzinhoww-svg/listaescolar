// Bloco de código estático (B2B03/`/parceiros/docs`): exemplo ILUSTRATIVO, nunca dado real (rotulado como tal pelo
// chamador). Sem "use client": não há interação (sem botão de copiar) — só exibição.

export function CodeSample({ title, code }: { title: string; code: unknown }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <p className="text-texto-3 text-[12px] font-extrabold tracking-[0.04em] uppercase">{title}</p>
      <pre tabIndex={0} aria-label={title} className="bg-tinta text-papel overflow-x-auto rounded-campo p-4 text-[12.5px] leading-relaxed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-verde-certo">
        <code>{JSON.stringify(code, null, 2)}</code>
      </pre>
    </div>
  );
}
