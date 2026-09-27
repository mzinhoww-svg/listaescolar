import { keysRevokedOnTransition, type B2bPartnerStatus } from "@/features/b2b/states";

// Cópia e regras de rótulo do `DecisionForm` (Admin15), extraídas do componente para ele caber em 250 linhas.
// Puro: sem JSX, sem estado — só texto e a decisão de quando confirmar.

export function labelFor(from: B2bPartnerStatus, to: B2bPartnerStatus): string {
  if (to === "rejected") return "Recusar";
  if (to === "suspended") return "Suspender";
  if (from === "suspended") return to === "active" ? "Reativar em produção" : "Reativar em sandbox";
  if (from === "active" && to === "sandbox") return "Rebaixar para sandbox";
  return to === "active" ? "Aprovar em produção" : "Aprovar em sandbox";
}

export type Confirmation = { title: string; body: string; confirm: string };

/** Só pede confirmação quando a transição revoga chave de verdade (`keysRevokedOnTransition`) — cobre suspender,
 * recusar e `active -> sandbox` (rebaixar) sem precisar listar cada status à mão (revisão final do branch S24:
 * `active -> sandbox` revogava as chaves `live` sem aviso nenhum). */
export function confirmationFor(to: B2bPartnerStatus, revoked: ReturnType<typeof keysRevokedOnTransition>): Confirmation | undefined {
  if (revoked === null) return undefined;
  if (to === "rejected") {
    return {
      title: "Recusar cadastro",
      body: "Recusar é definitivo para esta solicitação (estado terminal). O motivo registrado abaixo fica visível ao parceiro.",
      confirm: "Recusar agora",
    };
  }
  if (to === "suspended") {
    return {
      title: "Suspender parceiro",
      body: "Suspender uma conta revoga as chaves na hora: as chaves ativas param de funcionar imediatamente. Reativar depois não devolve essas chaves — o parceiro precisa emitir novas.",
      confirm: "Suspender agora",
    };
  }
  // Única transição restante com `revoked !== null`: `active -> sandbox` (revoga só as chaves `live`).
  return {
    title: "Rebaixar para sandbox",
    body: "Rebaixar para sandbox revoga as chaves de produção na hora: elas param de funcionar imediatamente. As chaves de sandbox continuam válidas; para produção de novo, o parceiro precisa de uma chave nova.",
    confirm: "Rebaixar agora",
  };
}

export const PLAN_OPTIONS = [
  { value: "sandbox", label: "Sandbox" },
  { value: "regional", label: "Regional" },
  { value: "national", label: "Nacional" },
  { value: "brand_campaigns", label: "Campanhas de marca" },
  { value: "edtech_integration", label: "Integração EdTech" },
] as const;
