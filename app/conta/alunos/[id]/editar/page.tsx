import { notFound } from "next/navigation";

import { BackHeader } from "@/components/cart/CartStates";
import { DeleteStudentButton } from "@/components/students/DeleteStudentButton";
import { StudentForm } from "@/components/students/StudentForm";
import { getSessionActor } from "@/features/auth/actor";
import { requireAccess } from "@/features/auth/guard";
import { getMyStudent } from "@/features/students/queries";
import { studentIdSchema } from "@/features/students/schemas";

import { updateStudentAction } from "../../actions";

export const metadata = { title: "Editar aluno · ListaCerta", robots: { index: false, follow: false } };

/** App13-NovoAluno reaproveitada para editar/excluir (S15). Alheio e inexistente são a mesma página 404 (RLS). */
export default async function EditStudentPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAccess("/conta");
  const { id } = await params;
  const parsedId = studentIdSchema.safeParse(id);
  if (!parsedId.success) notFound();
  const actor = await getSessionActor();
  const student = actor ? await getMyStudent(actor, parsedId.data) : null;
  if (!student) notFound();

  return (
    <main id="conteudo" className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-1 flex-col gap-4 px-6 pt-14 pb-9">
      <BackHeader href="/conta" title="Editar aluno" />
      <StudentForm
        action={updateStudentAction}
        defaults={{ id: student.id, nickname: student.nickname, gradeSlug: student.gradeSlug ?? undefined }}
        submitLabel="Salvar alterações"
        consent={false}
      />
      <div className="flex justify-center pt-2">
        <DeleteStudentButton id={student.id} nickname={student.nickname} />
      </div>
    </main>
  );
}
