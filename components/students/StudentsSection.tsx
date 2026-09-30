import Link from "next/link";

import { buttonClass } from "@/components/ui/Button";
import type { SavedListRow } from "@/features/saved-lists/queries";
import type { StudentRow } from "@/features/students/queries";
import { sendListHref } from "@/features/submissions/href";

/** App16-HubPais "Seus alunos" (S15): só apelido e série, nunca outro dado do menor. Cada cartão leva à lista e ao envio. */
export function StudentsSection({ students, savedLists = [] }: { students: readonly StudentRow[]; savedLists?: readonly SavedListRow[] }) {
  return (
    <section aria-label="Seus alunos" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-extrabold">Seus alunos</h2>
        <Link href="/conta/alunos/novo" className={buttonClass("text")}>
          Adicionar
        </Link>
      </div>
      {students.length === 0 ? (
        <div className="bg-branco-tonal flex flex-col gap-3 rounded-[20px] p-4">
          <p className="text-[15px] font-extrabold">Comece por aqui</p>
          <p className="text-texto-2 text-[14px] leading-relaxed font-semibold">
            Cadastre cada filho só pelo apelido e pela série. Assim você guarda a lista certa de cada um.
          </p>
          <Link href="/conta/alunos/novo" className={buttonClass("primary", "md", "w-full")}>
            Adicionar aluno
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5" aria-label="Alunos">
          {students.map((s) => {
            const saved = savedLists.find((l) => l.studentId === s.id && l.schoolInep && l.gradeSlug);
            const listHref = saved ? `/escolas/${saved.schoolInep}/${saved.gradeSlug}?ano=${saved.schoolYear}` : "/escolas";
            const sendHref = sendListHref({
              gradeSlug: s.gradeSlug ?? saved?.gradeSlug ?? undefined,
              ...(saved?.schoolInep ? { inep: saved.schoolInep } : {}),
              ...(saved?.schoolYear ? { year: saved.schoolYear } : {}),
            });
            const grade = s.gradeLabel;
            return (
              <li key={s.id} className="bg-branco-tonal flex flex-col gap-2 rounded-[20px] p-4">
                <div className="flex items-center gap-3">
                  <span className="bg-campo grid size-11 shrink-0 place-items-center rounded-full text-[15px] font-extrabold" aria-hidden="true">
                    {s.nickname.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="text-[15px] font-extrabold break-words">{s.nickname}</span>
                    <span className="text-texto-2 text-[13px] font-semibold">{grade ?? "Série indisponível"}</span>
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-2">
                  <Link href={listHref} className={buttonClass("text")}>
                    {saved ? (grade ? `Ver a lista do ${grade}` : "Ver a lista") : grade ? `Buscar a lista do ${grade}` : "Buscar a lista"}
                  </Link>
                  <Link href={sendHref} className={buttonClass("text")} aria-label={`Enviar a lista de ${s.nickname}`}>
                    Enviar a lista
                  </Link>
                  <Link href={`/conta/alunos/${s.id}/editar`} className={buttonClass("text")} aria-label={`Editar ${s.nickname}`}>
                    Editar
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
