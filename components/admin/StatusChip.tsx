const LABEL = { pending: "Pendente", processing: "Processando", completed: "Concluído", failed: "Falhou" } as const;
const STYLE = {
  pending: "bg-campo text-texto-2",
  processing: "bg-campo text-texto-2",
  completed: "bg-verde-certo/20 text-verde-fundo",
  failed: "bg-red-100 text-red-800",
} as const;

export function StatusChip({ status }: { status: keyof typeof LABEL }) {
  return (
    <span className={`inline-flex rounded-botao px-2.5 py-0.5 text-xs font-extrabold ${STYLE[status]}`}>
      {LABEL[status]}
    </span>
  );
}
