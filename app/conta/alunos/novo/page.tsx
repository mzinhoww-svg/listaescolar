import { BackHeader } from "@/components/cart/CartStates";
import { StudentForm } from "@/components/students/StudentForm";
import { requireAccess } from "@/features/auth/guard";
import { academicYears, defaultAcademicYear } from "@/features/grades/catalog";

import { createStudentAction } from "../actions";

export const metadata = { title: "Novo aluno · ListaCerta", robots: { index: false, follow: false } };

/** App13-NovoAluno (S15): só apelido e série; escola e ano letivo resolvem a lista a comparar. */
export default async function NewStudentPage() {
  await requireAccess("/conta");
  const now = new Date();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-1 flex-col gap-4 px-6 pt-14 pb-9">
      <BackHeader href="/conta" title="Novo aluno" />
      <StudentForm action={createStudentAction} years={academicYears(now)} defaultYear={defaultAcademicYear(now)} submitLabel="Salvar aluno" />
    </main>
  );
}
