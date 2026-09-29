import Link from "next/link";

import { BackHeader } from "@/components/cart/CartStates";
import { getSessionActor } from "@/features/auth/actor";
import { requireAccess } from "@/features/auth/guard";
import { listMySavedLists } from "@/features/saved-lists/queries";

import { removeSavedListAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Listas salvas · ListaCerta", robots: { index: false, follow: false } };

/** S15: listas oficiais que a família salvou, por aluno, escola e série. */
export default async function SavedListsPage() {
  await requireAccess("/conta");
  const actor = await getSessionActor();
  const rows = actor ? await listMySavedLists(actor).catch(() => []) : [];

  return (
    <main id="conteudo" className="mx-auto flex w-full max-w-[420px] flex-col gap-6 px-6 pt-14 pb-9">
      <BackHeader href="/conta" title="Listas salvas" />
      {rows.length === 0 ? (
        <p className="text-texto-2 text-[15px] font-medium">Nenhuma lista salva ainda.</p>
      ) : (
        <ul className="flex flex-col gap-3" aria-label="Listas salvas">
          {rows.map((r) => (
            <li key={r.id} className="bg-branco-tonal flex flex-col gap-1.5 rounded-[24px] p-5">
              <div className="flex items-center justify-between gap-2">
                <Link href={r.schoolInep && r.gradeSlug ? `/escolas/${r.schoolInep}/${r.gradeSlug}?ano=${r.schoolYear}` : "#"} className="text-[16px] font-extrabold underline">
                  {r.schoolName ?? "Escola indisponível"} · {r.gradeLabel ?? "Série indisponível"}
                </Link>
                <form action={removeSavedListAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <button type="submit" className="text-[12px] font-extrabold text-erro-texto underline">
                    Remover
                  </button>
                </form>
              </div>
              <span className="text-texto-2 text-[13px] font-semibold">
                Para {r.studentNickname ?? "aluno removido"} · ano letivo {r.schoolYear ?? "indisponível"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
