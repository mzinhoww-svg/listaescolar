"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

type Result = { status: "ok" } | { status: "error"; message: string };
type Student = { id: string; nickname: string };

/** "Salvar lista" (S15): a família escolhe para qual aluno; sem aluno cadastrado, oferece cadastrar um. */
export function SaveListButton({
  listId,
  students,
  loggedIn,
  nextPath,
  save,
}: {
  listId: string;
  students: readonly Student[];
  loggedIn: boolean;
  nextPath: string;
  save: (input: { studentId: string; listId: string }) => Promise<Result>;
}) {
  const [studentId, setStudentId] = useState(students[0]?.id ?? "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!loggedIn) {
    return (
      <Link href={`/entrar?next=${encodeURIComponent(nextPath)}`} className="text-verde-fundo text-[13px] font-extrabold underline">
        Entrar para salvar esta lista
      </Link>
    );
  }
  if (students.length === 0) {
    return (
      <Link href="/conta/alunos/novo" className="text-verde-fundo text-[13px] font-extrabold underline">
        Cadastrar um aluno para salvar esta lista
      </Link>
    );
  }
  if (saved) {
    return <p className="text-verde-fundo text-[13px] font-extrabold">Lista salva.</p>;
  }

  const onSave = () =>
    start(async () => {
      const r = await save({ studentId, listId });
      if (r.status === "ok") setSaved(true);
      else setError(r.message);
    });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <select
          aria-label="Para qual aluno"
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
          className="bg-campo text-tinta h-12 flex-1 rounded-campo px-3 text-[14px] font-semibold"
        >
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nickname}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onSave}
          disabled={pending}
          className="bg-tinta text-papel rounded-botao h-12 shrink-0 px-4 text-[14px] font-extrabold disabled:opacity-60"
        >
          {pending ? "Salvando…" : "Salvar lista"}
        </button>
      </div>
      <div aria-live="polite">{error ? <p role="alert" className="text-erro-texto text-[12px] font-bold">{error}</p> : null}</div>
    </div>
  );
}
