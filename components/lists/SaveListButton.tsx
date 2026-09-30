"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { Button, buttonClass } from "@/components/ui/Button";
import { InlineStatus } from "@/components/ui/InlineStatus";
import { loginPathFor } from "@/features/auth/redirect";

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
  save: (input: { studentId: string; listId: string; next?: string }) => Promise<Result>;
}) {
  const [studentId, setStudentId] = useState(students[0]?.id ?? "");
  const [savedFor, setSavedFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!loggedIn) {
    return (
      <Link href={loginPathFor(nextPath)} className={buttonClass("text")}>
        Entrar para salvar esta lista
      </Link>
    );
  }
  if (students.length === 0) {
    return (
      <Link href="/conta/alunos/novo" className={buttonClass("text")}>
        Cadastrar um aluno para salvar esta lista
      </Link>
    );
  }
  if (savedFor !== null) {
    return (
      <div className="flex flex-col items-start gap-1">
        <InlineStatus tone="success">Lista salva para {savedFor}.</InlineStatus>
        <Link href="/conta/listas-salvas" className={buttonClass("text")}>
          Ver em Minha conta
        </Link>
      </div>
    );
  }

  const onSave = () =>
    start(async () => {
      setError(null);
      const r = await save({ studentId, listId, next: nextPath });
      if (r.status === "ok") setSavedFor(students.find((s) => s.id === studentId)?.nickname ?? "o aluno");
      else setError(r.message);
    });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <select
          aria-label="Para qual aluno"
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
          className="bg-campo text-tinta border-texto-3 h-12 min-w-0 flex-1 rounded-campo border-[1.5px] px-3 text-[14px] font-semibold"
        >
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nickname}
            </option>
          ))}
        </select>
        <Button onClick={onSave} loading={pending} className="shrink-0">
          Salvar lista
        </Button>
      </div>
      {error ? <InlineStatus tone="error">{error}</InlineStatus> : null}
    </div>
  );
}
