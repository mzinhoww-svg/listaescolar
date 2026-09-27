// Bloco de código estático (B2B03/`/parceiros/docs`): exemplo ILUSTRATIVO, nunca dado real (rotulado como tal pelo
// chamador). Sem "use client": não há interação (sem botão de copiar) — só exibição.

export function CodeSample({ title, code }: { title: string; code: unknown }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-texto-3 text-[12px] font-extrabold tracking-[0.04em] uppercase">{title}</p>
      <pre className="bg-tinta text-papel overflow-x-auto rounded-campo p-4 text-[12.5px] leading-relaxed">
        <code>{JSON.stringify(code, null, 2)}</code>
      </pre>
    </div>
  );
}
