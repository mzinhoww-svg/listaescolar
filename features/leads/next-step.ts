import type { LeadStatus } from "./state";

export type LeadNextStepCopy = { title: string; body: string };

/** Próximo passo da família em cada estado da cotação. Nenhum prazo é prometido: quem responde é a papelaria. */
const COPY: Record<LeadStatus, LeadNextStepCopy> = {
  received: { title: "Pedido enviado", body: "A papelaria recebeu o pedido. Se quiser adiantar, abra o WhatsApp e mande a mensagem pronta." },
  viewed: { title: "A papelaria abriu a sua lista", body: "Agora é com ela informar o valor. Você pode reforçar o pedido pelo WhatsApp." },
  in_progress: { title: "A papelaria está atendendo", body: "Fique de olho no WhatsApp: é por lá que o valor costuma chegar." },
  quote_sent: { title: "A papelaria informou o valor", body: "Confira o valor abaixo e combine a compra com a papelaria pelo WhatsApp." },
  awaiting_customer: { title: "A papelaria espera a sua resposta", body: "Abra o WhatsApp para responder e combinar a compra." },
  converted: { title: "Compra combinada com a papelaria", body: "Este pedido foi encerrado como compra. Se algo não bateu, fale com a papelaria." },
  declined: { title: "A papelaria não fechou este pedido", body: "Você pode pedir cotação a outra papelaria ou montar um carrinho com lojas online." },
  expired: { title: "O pedido expirou", body: "Sem resposta dentro da validade. Peça uma nova cotação, a mesma ou a outra papelaria." },
  cancelled: { title: "Pedido cancelado", body: "Nada foi enviado depois do cancelamento. Você pode fazer um novo pedido quando quiser." },
};

export function leadNextStep(status: LeadStatus): LeadNextStepCopy {
  return COPY[status];
}
