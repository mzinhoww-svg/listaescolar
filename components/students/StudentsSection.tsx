import Link from "next/link";

import type { StudentRow } from "@/features/students/queries";

/** App16-HubPais "Seus alunos" (S15): só apelido e série, nunca outro dado do menor. */
export function StudentsSection({ students }: { students: readonly StudentRow[] }) {
  return (
    <section aria-label="Seus alunos" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-extrabold">Seus alunos</h2>
        <Link href="/conta/alunos/novo" className="text-verde-fundo text-[13px] font-extrabold">
          Adicionar
        </Link>
      </div>
      {students.length === 0 ? (
        <p className="text-texto-2 text-[13px] font-semibold">Nenhum aluno cadastrado ainda.</p>
      ) : (
        <ul className="flex flex-col gap-2.5" aria-label="Alunos">
          {students.map((s) => (
            <li key={s.id}>
              <Link href={`/conta/alunos/${s.id}/editar`} className="bg-branco-tonal flex items-center gap-3 rounded-[20px] p-4">
                <span className="bg-campo grid size-11 shrink-0 place-items-center rounded-full text-[15px] font-extrabold">
                  {s.nickname.slice(0, 1).toUpperCase()}
                </span>
                <span className="flex flex-col">
                  <span className="text-[15px] font-extrabold">{s.nickname}</span>
                  <span className="text-texto-2 text-[13px] font-semibold">
                    {s.schoolName ?? "Escola indisponível"} · {s.gradeLabel ?? "Série indisponível"} · {s.schoolYear}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
