type Props = { frases: string[] };

/** `compra_ideal` de quem marcou `pode_citar`. Nunca recebe nome, telefone ou session_id. */
export function Frases({ frases }: Props) {
  return (
    <section aria-label="Frases" className="flex flex-col gap-3">
      <h2 className="text-lg font-extrabold">Frases</h2>
      {frases.length === 0 ? (
        <p className="text-texto-2 text-sm">Nenhuma frase autorizada ainda.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {frases.map((frase, i) => (
            <li
              key={i}
              className="border-linha rounded-card text-texto-2 border bg-white p-4 text-sm italic"
            >
              “{frase}”
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
