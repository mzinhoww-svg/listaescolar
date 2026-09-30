import Link from "next/link";

import { buttonClass } from "@/components/ui/Button";
import type { SavedListRow } from "@/features/saved-lists/queries";

const PREVIEW = 3;

/** App12/App19 "Listas salvas" (S15): listas oficiais que a família guardou, por aluno. */
export function SavedListsSection({ savedLists }: { savedLists: readonly SavedListRow[] }) {
  const shown = savedLists.slice(0, PREVIEW);
  return (
    <section aria-label="Listas salvas" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-extrabold">Listas salvas</h2>
        {savedLists.length > 0 ? (
          <Link href="/conta/listas-salvas" className={buttonClass("text")}>
            Ver todas
          </Link>
        ) : null}
      </div>
      {shown.length === 0 ? (
        <div className="flex flex-col items-start">
          <p className="text-texto-2 text-[14px] font-semibold">Nenhuma lista salva ainda. Abra a lista da escola e toque em Salvar lista.</p>
          <Link href="/escolas" className={buttonClass("text", "md", "-ml-2")}>
            Buscar a escola
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5" aria-label="Listas salvas recentes">
          {shown.map((r) => (
            <li key={r.id}>
              <Link
                href={r.schoolInep && r.gradeSlug ? `/escolas/${r.schoolInep}/${r.gradeSlug}?ano=${r.schoolYear}` : "/conta/listas-salvas"}
                className="bg-branco-tonal flex min-h-11 flex-col gap-0.5 rounded-[20px] p-4"
              >
                <span className="text-[14px] font-extrabold break-words">
                  {r.schoolName ?? "Escola indisponível"} · {r.gradeLabel ?? "Série indisponível"}
                </span>
                <span className="text-texto-2 text-[13px] font-semibold">Para {r.studentNickname ?? "aluno removido"}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
