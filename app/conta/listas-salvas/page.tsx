import Link from "next/link";

import { BackHeader } from "@/components/cart/CartStates";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { InlineEmpty } from "@/components/ui/InlineEmpty";
import { getSessionActor } from "@/features/auth/actor";
import { requireAccess } from "@/features/auth/guard";
import { listMySavedLists } from "@/features/saved-lists/queries";

import { removeSavedListAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Listas salvas · ListaCerta", robots: { index: false, follow: false } };

/** S15: listas oficiais que a família salvou, por aluno, escola e série. */
export default async function SavedListsPage() {
  await requireAccess("/conta/listas-salvas");
  const actor = await getSessionActor();
  const rows = actor ? await listMySavedLists(actor).catch(() => []) : [];

  return (
    <main id="conteudo" className="mx-auto flex w-full max-w-[420px] flex-col gap-6 px-6 pt-6 pb-9">
      <BackHeader href="/conta" title="Listas salvas" heading />
      {rows.length === 0 ? (
        <InlineEmpty text="Nenhuma lista salva ainda. Abra a lista da escola e toque em Salvar lista." href="/escolas" label="Buscar a escola" />
      ) : (
        <ul className="flex flex-col gap-3" aria-label="Listas salvas">
          {rows.map((r) => {
            const who = r.studentNickname ?? "aluno removido";
            return (
              <li key={r.id} className="bg-branco-tonal flex flex-col gap-1 rounded-[24px] p-5">
                <Link
                  href={r.schoolInep && r.gradeSlug ? `/escolas/${r.schoolInep}/${r.gradeSlug}?ano=${r.schoolYear}` : "/conta/listas-salvas"}
                  className="inline-flex min-h-11 items-center text-[16px] font-extrabold break-words underline"
                >
                  {r.schoolName ?? "Escola indisponível"} · {r.gradeLabel ?? "Série indisponível"}
                </Link>
                <span className="text-texto-2 text-[13px] font-semibold">
                  Para {who} · ano letivo {r.schoolYear ?? "indisponível"}
                </span>
                <div>
                  <ConfirmDialog
                    triggerLabel={`Remover lista de ${who}`}
                    title={`Remover a lista de ${who}?`}
                    body="A lista deixa de aparecer em Minha conta. A lista da escola continua publicada e você pode salvá-la de novo."
                    confirmLabel="Remover agora"
                    action={removeSavedListAction}
                    hidden={{ id: r.id }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
