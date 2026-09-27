import { InsightsExplorer } from "./InsightsExplorer";

// B2B08 (`/b2b/insights`): demanda agregada por categoria, série e cidade, com k-anonimato. Célula abaixo do k
// mínimo configurado no banco fica oculta ("indisponível"); nunca um número inventado no lugar.

export const dynamic = "force-dynamic";
export const metadata = { title: "Insights · Portal B2B · ListaCerta" };

export default function Page() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-[30px] leading-[1.1] font-extrabold tracking-[-0.035em]">Insights</h1>
      <p className="text-texto-2 max-w-2xl text-[14px] font-semibold">
        Demanda agregada por categoria e série, por cidade. Sem dado de menor, de pai, de lead individual ou de papelaria — só a contagem de listas distintas, e só quando esse número não deixa
        identificar um caso isolado.
      </p>
      <InsightsExplorer />
    </div>
  );
}
