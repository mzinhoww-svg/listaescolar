type Props = { label: string; value: string | null };

/** Valor jurídico ainda indefinido fica visível como marcação, nunca inventado. */
export function Placeholder({ label, value }: Props) {
  if (value) return <>{value}</>;
  return <mark className="bg-aviso-fundo text-aviso-texto rounded px-1 font-bold">[a definir: {label}]</mark>;
}
