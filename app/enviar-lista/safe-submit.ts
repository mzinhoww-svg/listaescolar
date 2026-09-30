import { messageFor } from "@/features/submissions/copy";
import type { SubmitState } from "@/features/submissions/form-schema";
import { isControlFlowError, submitFailureCode } from "@/features/submissions/network";

import { submitListAction } from "./actions";

/**
 * A chamada da Server Action viaja por `fetch`: sem rede ela REJEITA. Sem este envoltório a rejeição derrubaria a tela
 * (limite de erro); aqui vira um estado de erro com "Tentar de novo". `redirect()` da action não é erro: mantém o estado.
 */
export async function safeSubmit(prev: SubmitState, data: FormData): Promise<SubmitState> {
  try {
    return await submitListAction(prev, data);
  } catch (e) {
    if (isControlFlowError(e)) return prev;
    const code = submitFailureCode(e);
    return { status: "error", code, message: messageFor(code) };
  }
}
