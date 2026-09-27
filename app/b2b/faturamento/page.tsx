import { getSessionActor } from "@/features/auth/actor";
import { listMyStatements } from "@/features/campaigns/queries";

// B2B09 (`/b2b/faturamento`): extratos por período (uso de API + campanhas). Nunca cobra automaticamente — cada
// extrato é um registro imutável mais uma instrução para o admin agir manualmente fora do sistema.

export const dynamic = "force-dynamic";
export const metadata = { title: "Faturamento · Portal B2B · ListaCerta" };

export default async function Page() {
  const actor = await getSessionActor();
  if (!actor) return <p className="text-texto-2 text-[15px] font-bold">Não foi possível carregar seu parceiro agora.</p>;
  const statements = await listMyStatements(actor);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-[30px] leading-[1.1] font-extrabold tracking-[-0.035em]">Faturamento</h1>
      <p className="text-texto-2 max-w-2xl text-[14px] font-semibold">
        Cada extrato soma o uso da API (v1) e o acúmulo das campanhas do período. Linha sem preço configurado mostra <strong>&ldquo;indisponível&rdquo;</strong> — nunca um valor inventado. Não há
        cobrança automática: o admin usa este registro para agir manualmente (Pix, boleto ou o que for acordado).
      </p>
      {statements.length === 0 ? (
        <p className="text-texto-2 rounded-[20px] bg-white p-6 text-[15px] font-bold">Nenhum extrato gerado ainda.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {statements.map((s) => (
            <div key={s.id} className="rounded-[20px] bg-white p-6">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[16px] font-extrabold">
                  {s.periodStart} — {s.periodEnd}
                </p>
                <p className="text-[18px] font-extrabold">{s.totalDisplay}</p>
              </div>
              <table className="w-full text-left text-[14px]">
                <thead className="text-texto-3 text-[12px] font-extrabold uppercase">
                  <tr>
                    <th className="py-2">Item</th>
                    <th className="py-2">Quantidade</th>
                    <th className="py-2">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFEBE2]">
                  {s.lineItems.map((li, i) => (
                    <tr key={i}>
                      <td className="py-2">{li.label}</td>
                      <td className="py-2">
                        {li.quantity} {li.unit}
                      </td>
                      <td className="py-2 font-bold">{li.amountDisplay}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {s.paymentInstruction ? <p className="text-texto-2 mt-3 text-[13px] font-bold">Instrução: {s.paymentInstruction}</p> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
