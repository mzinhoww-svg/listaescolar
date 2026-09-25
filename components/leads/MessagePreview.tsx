/** Prévia da mensagem do WhatsApp (só o que será enviado: código, escola, série, ano e link). */
export function MessagePreview({ text, note }: { text: string; note?: string }) {
  return (
    <figure className="bg-campo rounded-campo p-4" aria-label="Prévia da mensagem">
      <figcaption className="text-texto-3 mb-1.5 text-[12px] font-extrabold">Prévia da mensagem</figcaption>
      <pre className="font-sans text-[13px] leading-[1.45] font-semibold whitespace-pre-wrap" data-testid="message-preview">
        {text}
      </pre>
      {note ? <p className="text-texto-3 mt-2 text-[12px] font-semibold">{note}</p> : null}
    </figure>
  );
}
