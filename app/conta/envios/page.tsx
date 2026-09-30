import Link from "next/link";

import { BackHeader } from "@/components/cart/CartStates";
import { DemoSeal } from "@/components/leads/StatusBadge";
import { buttonClass } from "@/components/ui/Button";
import { InlineStatus } from "@/components/ui/InlineStatus";
import { getSessionActor } from "@/features/auth/actor";
import { requireAccess } from "@/features/auth/guard";
import { describeSubmission } from "@/features/submissions/list-model";
import { sendListHref } from "@/features/submissions/href";
import { listMySubmissions, type MySubmission } from "@/features/submissions/my-submissions";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Meus envios · ListaCerta", robots: { index: false, follow: false } };

const dateLong = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Cuiaba" });

/** UX-060: onde a família reencontra cada lista que enviou, com o estado e o link ao andamento. */
export default async function EnviosPage() {
  await requireAccess("/conta/envios");
  const actor = await getSessionActor();
  let items: MySubmission[] = [];
  let failed = false;
  try {
    items = actor ? await listMySubmissions(await createClient(), actor.userId) : [];
  } catch (error) {
    console.error("listar envios", error instanceof Error ? error.message : "erro");
    failed = true;
  }
  return (
    <main id="conteudo" className="mx-auto flex w-full max-w-[420px] flex-1 flex-col gap-6 px-6 pt-6 pb-9">
      <BackHeader href="/conta" title="Meus envios" heading />
      <p className="text-texto-2 text-[14px] leading-[1.4] font-semibold">
        As listas que você enviou ficam aqui. Abra uma para ver o andamento ou o resultado.
      </p>
      {failed ? (
        <InlineStatus tone="error">
          Não foi possível carregar seus envios agora.{" "}
          <Link href="/conta/envios" className="underline">
            Tentar de novo
          </Link>
        </InlineStatus>
      ) : items.length === 0 ? (
        <div className="flex flex-col gap-3">
          <p className="text-texto-2 text-[15px] font-medium">Você ainda não enviou nenhuma lista. Se a lista da sua escola não está no ListaCerta, mande a foto ou o PDF.</p>
          <Link href={sendListHref()} className={buttonClass("primary", "lg", "w-full")}>
            Enviar a lista da escola
          </Link>
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-3" aria-label="Envios">
            {items.map((s) => {
              const d = describeSubmission(s.status);
              const series = [s.grade, s.schoolYear].filter((v) => v !== null).join(" · ");
              return (
                <li key={s.id}>
                  <Link href={`/enviar-lista/${s.id}`} className="bg-branco-tonal focus-visible:outline-verde-fundo flex min-h-11 flex-col gap-1.5 rounded-[24px] p-5 focus-visible:outline-2 focus-visible:outline-offset-2">
                    <span className="flex items-start justify-between gap-2">
                      <span className="text-[16px] font-extrabold break-words">{s.schoolName ?? "Escola não informada"}</span>
                      {s.isDemo ? <DemoSeal /> : null}
                    </span>
                    <span className="text-texto-2 text-[13px] font-semibold">
                      {series ? `${series} · ` : ""}enviado em {dateLong.format(new Date(s.createdAt))}
                    </span>
                    <span className="text-[14px] font-extrabold">{d.label}</span>
                    <span className="text-texto-2 text-[13px] font-semibold">{d.hint}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <Link href={sendListHref()} className={buttonClass("outline", "md", "w-full")}>
            Enviar outra lista
          </Link>
        </>
      )}
    </main>
  );
}
