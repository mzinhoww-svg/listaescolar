import Link from "next/link";

import { BackHeader } from "@/components/cart/CartStates";
import { buttonClass } from "@/components/ui/Button";
import { ConsentsList } from "@/components/privacy/ConsentsList";
import { DeleteAccountForm } from "@/components/privacy/DeleteAccountForm";
import { requireAccess } from "@/features/auth/guard";
import { getSessionActor } from "@/features/auth/actor";
import { PRIVACY_COPY } from "@/features/privacy/copy";
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
    <main id="conteudo" className="mx-auto flex w-full max-w-[420px] flex-1 flex-col gap-8 px-6 pt-4 pb-12">
      <header className="flex flex-col gap-3">
        <BackHeader href="/conta" title="Privacidade e dados" heading />
        <p className="text-texto-2 text-[14px] font-semibold">
          Veja o texto completo na{" "}
          <Link href="/privacidade" className="inline-flex min-h-11 items-center font-extrabold underline">
            {PRIVACY_COPY.policyLink}
          </Link>
          .
        </p>
      </header>

      <section aria-label="Seus consentimentos" className="flex flex-col gap-3">
        <h2 className="text-[15px] font-extrabold">Seus consentimentos</h2>
        <ConsentsList consents={consents} />
      </section>

      <section aria-label="Exportar seus dados" className="flex flex-col gap-3">
        <h2 className="text-[15px] font-extrabold">Exportar seus dados</h2>
        <p className="text-texto-2 text-[14px] font-semibold">{PRIVACY_COPY.exportText}</p>
        <a href="/api/conta/exportar" className={buttonClass("primary", "lg", "w-full")}>
          {PRIVACY_COPY.exportButton}
        </a>
      </section>

      <section aria-label="Excluir sua conta" className="flex flex-col gap-3 border-t border-black/10 pt-6">
        <h2 className="text-[15px] font-extrabold">Excluir sua conta</h2>
        <p className="text-texto-2 text-[14px] font-semibold">{PRIVACY_COPY.deleteAccount}</p>
        <DeleteAccountForm />
      </section>
    </main>
  );
}
