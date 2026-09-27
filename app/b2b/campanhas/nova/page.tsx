import { redirect } from "next/navigation";

import { getSessionActor } from "@/features/auth/actor";
import { getMyPartnerId } from "@/features/campaigns/queries";

import { NovaCampanhaForm } from "./NovaCampanhaForm";

// B2B07 (`/b2b/campanhas/nova`): produto sugerido, categoria, série/cidade, CPM/CPC, bid — sempre declarado pelo
// próprio parceiro (nunca um preço de tabela da plataforma). A checagem Procon (marca exigida pela escola) é
// decidida no banco a cada lista servida, não aqui: o aviso abaixo é só informativo.

export const dynamic = "force-dynamic";
export const metadata = { title: "Nova campanha · Portal B2B · ListaCerta" };

export default async function Page() {
  const actor = await getSessionActor();
  if (!actor) redirect("/entrar?next=%2Fb2b%2Fcampanhas%2Fnova");
  const partnerId = await getMyPartnerId(actor);
  if (!partnerId) redirect("/parceiros?cadastro=1");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-[30px] leading-[1.1] font-extrabold tracking-[-0.035em]">Nova campanha</h1>
      <p className="text-texto-2 max-w-2xl text-[14px] font-semibold">
        A campanha nasce como rascunho. Ao enviar para aprovação, o admin revisa antes de ela começar a servir. Ela nunca aparece em listas cuja categoria alvo tem item de marca exigida pela escola
        (Lei 12.886) — o bloqueio é automático, por lista, e independe desta tela.
      </p>
      <NovaCampanhaForm partnerId={partnerId} />
    </div>
  );
}
