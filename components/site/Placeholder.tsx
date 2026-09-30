type Props = { label: string; value: string | null };

/**
 * Valor jurídico ainda indefinido: aparece como "Em revisão", sem colchetes nem "[a definir]" em produção (S29, H-01, R-49).
 * O nome do campo fica só para leitor de tela e testes. Nunca inventa o dado; quem o fornece é o humano.
 */
export function Placeholder({ label, value }: Props) {
  if (value) return <>{value}</>;
  return (
    <mark data-pendente={label} className="bg-aviso-fundo text-aviso-texto rounded px-1 font-bold">
      Em revisão<span className="sr-only">: {label}</span>
    </mark>
  );
}
