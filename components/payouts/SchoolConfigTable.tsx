import { formatBpsAsPercent } from "@/features/payouts/bps";
import { PIX_KEY_KIND_LABEL, type SchoolPayoutConfigView } from "@/features/payouts/ports";

/** Lista de configs de repasse já publicadas (Admin13). Chave Pix sempre mascarada (só os 4 últimos caracteres). */
export function SchoolConfigTable({ rows }: { rows: readonly SchoolPayoutConfigView[] }) {
  const active = rows.filter((r) => r.target !== "none");
  if (active.length === 0) {
    return <p className="text-texto-3 text-[14px] font-semibold">Nenhuma escola com repasse configurado ainda.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-card bg-white">
      <table className="w-full min-w-[640px] text-left text-[14px]">
        <thead>
          <tr className="text-texto-3 border-linha border-b text-[12px] tracking-[0.08em] uppercase">
            <th scope="col" className="px-5 py-4">Escola</th>
            <th scope="col" className="px-5 py-4">Alvo</th>
            <th scope="col" className="px-5 py-4">Repasse</th>
            <th scope="col" className="px-5 py-4">Beneficiário</th>
            <th scope="col" className="px-5 py-4">Chave Pix</th>
          </tr>
        </thead>
        <tbody>
          {active.map((r) => (
            <tr key={r.id} className="border-linha border-b last:border-b-0">
              <th scope="row" className="px-5 py-3.5 font-extrabold">{r.schoolName}</th>
              <td className="px-5 py-3.5 font-bold">{r.target === "apm" ? "APM" : "Escola"}</td>
              <td className="px-5 py-3.5 font-bold">{formatBpsAsPercent(r.payoutBps)}%</td>
              <td className="px-5 py-3.5 font-bold">{r.beneficiaryName ?? "indisponível"}</td>
              <td className="px-5 py-3.5 font-bold">{r.pixKeyMasked ?? "indisponível"}{r.pixKeyKind ? ` · ${PIX_KEY_KIND_LABEL[r.pixKeyKind]}` : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
