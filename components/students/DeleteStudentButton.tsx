import { deleteStudentAction } from "@/app/conta/alunos/actions";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

/** Exclusão real (LGPD): apaga o aluno e as listas salvas para ele. Confirmação com o nome do apelido. */
export function DeleteStudentButton({ id, nickname }: { id: string; nickname: string }) {
  return (
    <ConfirmDialog
      triggerLabel="Excluir aluno"
      title={`Excluir ${nickname}?`}
      body="Isso apaga o aluno e as listas salvas para ele de verdade. Não pode ser desfeito."
      confirmLabel="Excluir agora"
      action={deleteStudentAction}
      hidden={{ id }}
    />
  );
}
