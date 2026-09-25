import { alertLabel } from "@/features/review/phrases";

/** Sinalização para revisão, em texto neutro: não é parecer jurídico nem afirma conformidade. `critical` só destaca. */
export function AlertNote({ code, critical = false }: { code: string; critical?: boolean }) {
  return (
    <p className={`${critical ? "bg-erro-fundo text-erro-texto" : "bg-campo text-tinta"} rounded-campo px-3 py-1.5 text-[13px] font-bold`}>
      <span className="font-extrabold">{critical ? "Alerta crítico: " : "Atenção: "}</span>
      {alertLabel(code)}
    </p>
  );
}
