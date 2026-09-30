import type { ClaimStatus } from "./state";

export type NextStep = { title: string; body: string; cta: string };

/** O que a pessoa faz agora, por estado do pedido. Sem prazo prometido e sem afirmar verificação antes da aprovação. */
export function nextStep(status: ClaimStatus, hasList: boolean): NextStep {
  switch (status) {
    case "submitted":
      return { title: "Conclua o pedido", body: "Escolha como confirmar que você fala pela escola para a equipe poder analisar.", cta: "Concluir o pedido" };
    case "awaiting_verification":
      return {
        title: "Prepare a lista da escola",
        body: "A equipe analisa o pedido. Enquanto isso, deixe a lista em PDF pronta para enviar assim que a escola for aprovada.",
        cta: "Ver o status do pedido",
      };
    case "token_expired":
      return { title: "Peça um novo código", body: "O código ou link venceu. Peça outro na página do pedido para continuar.", cta: "Pedir novo código" };
    case "insufficient_evidence":
      return { title: "Envie mais evidências", body: "A equipe pediu mais um comprovante. Veja o motivo e reenvie na página do pedido.", cta: "Enviar evidências" };
    case "rejected":
      return { title: "Pedido recusado", body: "Veja o motivo informado pela equipe. Se puder corrigir, faça um novo pedido.", cta: "Ver o motivo e pedir de novo" };
    case "approved":
      return hasList
        ? { title: "Sua lista oficial está no ar", body: "Divulgue o link da lista para as famílias e envie a lista de outra série ou de um novo ano quando precisar.", cta: "Ver a lista oficial" }
        : { title: "Envie a lista da escola", body: "A escola já está sob a sua administração. Envie a lista para as famílias encontrarem.", cta: "Enviar a lista" };
  }
}
