import Link from "next/link";

import { ConsentsList } from "@/components/privacy/ConsentsList";
import { DeleteAccountForm } from "@/components/privacy/DeleteAccountForm";
import { requireAccess } from "@/features/auth/guard";
import { getSessionActor } from "@/features/auth/actor";
import { listMyConsents } from "@/features/privacy/queries";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Privacidade e dados · ListaCerta", robots: { index: false, follow: false } };

/**
 * App nova, sem tela de referência (S17): consentimentos com revogação, exportação e exclusão de conta. Não
 * afirma conformidade jurídica (texto completo fica em `/privacidade`, com placeholders pendentes de jurídico).
 */
export default async function PrivacyPage() {
  await requireAccess("/conta/privacidade");
  const actor = await getSessionActor();
  const consents = actor ? await listMyConsents(await createClient(), actor.userId).catch(() => []) : [];

  return (
    <main id="conteudo" className="mx-auto flex w-full max-w-[420px] flex-1 flex-col gap-8 px-6 pt-6 pb-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-[28px] leading-[1.1] font-extrabold tracking-[-0.035em]">Privacidade e dados</h1>
        <p className="text-texto-2 text-[13px] font-semibold">
          Veja o texto completo em <Link href="/privacidade" className="underline">/privacidade</Link>.
        </p>
      </header>

      <section aria-label="Seus consentimentos" className="flex flex-col gap-3">
        <h2 className="text-[15px] font-extrabold">Seus consentimentos</h2>
        <ConsentsList consents={consents} />
      </section>

      <section aria-label="Exportar seus dados" className="flex flex-col gap-3">
        <h2 className="text-[15px] font-extrabold">Exportar seus dados</h2>
        <p className="text-texto-2 text-[13px] font-semibold">
          Baixe um arquivo com os dados da sua conta (perfil, consentimentos, estudantes, listas salvas, carrinhos,
          envios, cotações e pedidos para administrar escola). Nunca inclui dado de outra pessoa.
        </p>
        <a
          href="/api/conta/exportar"
          className="bg-tinta text-papel flex h-14 w-full items-center justify-center rounded-botao text-base font-extrabold"
        >
          Baixar meus dados (JSON)
        </a>
      </section>

      <section aria-label="Excluir sua conta" className="flex flex-col gap-3 border-t border-black/10 pt-6">
        <h2 className="text-[15px] font-extrabold">Excluir sua conta</h2>
        <p className="text-texto-2 text-[13px] font-semibold">
          Apagamos de verdade o que é pessoal: perfil, estudantes, listas salvas, carrinhos, assinaturas de aviso e
          preferências de notificação. O registro que mantemos (cotações e pedidos para administrar escola de escola) continua, mas
          anonimizado — sem seu nome nem contato. Se você for a única responsável por um cadastro de papelaria ou
          por um parceiro do portal B2B, ou tiver histórico de revisão administrativa de listas, a exclusão é
          recusada com uma mensagem explicando o motivo. Esta ação não tem volta.
        </p>
        <DeleteAccountForm />
      </section>
    </main>
  );
}
