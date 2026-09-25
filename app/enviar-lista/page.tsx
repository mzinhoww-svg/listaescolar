import { requireAccess } from "@/features/auth/guard";

import { SubmitForm } from "./SubmitForm";

export const metadata = { title: "Enviar lista · ListaCerta" };
// A action grava o arquivo e roda o pipeline (orçamento de 10 s): precisa de folga sobre o padrão.
export const maxDuration = 30;

/** Ano letivo padrão: a partir de agosto, o próximo. */
function schoolYears(now = new Date()) {
  const y = now.getFullYear();
  return { years: [y, y + 1], defaultYear: now.getMonth() >= 7 ? y + 1 : y };
}

export default async function Page() {
  await requireAccess("/enviar-lista");
  return <SubmitForm {...schoolYears()} />;
}
