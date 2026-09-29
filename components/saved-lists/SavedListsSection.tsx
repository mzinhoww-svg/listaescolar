import Link from "next/link";

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
          <Link href="/conta/listas-salvas" className="text-verde-fundo inline-flex min-h-11 items-center text-[13px] font-extrabold">
            Ver todas
          </Link>
        ) : null}
      </div>
      {shown.length === 0 ? (
        <p className="text-texto-2 text-[13px] font-semibold">
          Nenhuma lista salva ainda.{" "}
          <Link href="/escolas" className="text-verde-fundo inline-flex min-h-11 items-center font-extrabold underline">
            Buscar a escola
          </Link>{" "}
          e toque em Salvar lista.
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5" aria-label="Listas salvas recentes">
          {shown.map((r) => (
            <li key={r.id}>
              <Link
                href={r.schoolInep && r.gradeSlug ? `/escolas/${r.schoolInep}/${r.gradeSlug}?ano=${r.schoolYear}` : "/conta/listas-salvas"}
                className="bg-branco-tonal flex flex-col gap-0.5 rounded-[20px] p-4"
              >
                <span className="text-[14px] font-extrabold">
                  {r.schoolName ?? "Escola indisponível"} · {r.gradeLabel ?? "Série indisponível"}
                </span>
                <span className="text-texto-2 text-[12px] font-semibold">Para {r.studentNickname ?? "aluno removido"}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
