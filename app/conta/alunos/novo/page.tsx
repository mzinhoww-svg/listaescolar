import { BackHeader } from "@/components/cart/CartStates";
import { StudentForm } from "@/components/students/StudentForm";
import { requireAccess } from "@/features/auth/guard";

import { createStudentAction } from "../actions";

export const metadata = { title: "Novo aluno · ListaCerta", robots: { index: false, follow: false } };

/** App13-NovoAluno (S15): só apelido e série (SPEC §5). Escola e ano letivo vivem na lista salva, não no aluno. */
export default async function NewStudentPage() {
  await requireAccess("/conta");
  return (
    <main id="conteudo" className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-1 flex-col gap-4 px-6 pt-14 pb-9">
      <BackHeader href="/conta" title="Novo aluno" heading />
      <StudentForm action={createStudentAction} submitLabel="Salvar aluno" />
    </main>
  );
}
