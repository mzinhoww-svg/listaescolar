import Link from "next/link";

import type { StudentRow } from "@/features/students/queries";

/** App16-HubPais "Seus alunos" (S15): só apelido e série, nunca outro dado do menor. */
export function StudentsSection({ students }: { students: readonly StudentRow[] }) {
  return (
    <section aria-label="Seus alunos" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-extrabold">Seus alunos</h2>
        <Link href="/conta/alunos/novo" className="text-verde-fundo flex min-h-11 items-center text-[13px] font-extrabold">
          Adicionar
        </Link>
      </div>
      {students.length === 0 ? (
        <div className="bg-branco-tonal flex flex-col gap-3 rounded-[20px] p-4">
          <p className="text-[15px] font-extrabold">Comece por aqui</p>
          <p className="text-texto-2 text-[13px] leading-relaxed font-semibold">
            Cadastre cada filho só pelo apelido e pela série. Assim você guarda a lista certa de cada um.
          </p>
          <Link
            href="/conta/alunos/novo"
            className="bg-tinta text-papel focus-visible:outline-verde-fundo flex h-12 items-center justify-center rounded-botao text-[15px] font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Adicionar aluno
          </Link>
        </div>
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
                  <span className="text-texto-2 text-[13px] font-semibold">{s.gradeLabel ?? "Série indisponível"}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
