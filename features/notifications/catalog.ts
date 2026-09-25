// Catálogo dos eventos (SPEC §6). `Record<NotificationEvent, ...>`: evento novo sem entrada quebra o typecheck.
import type { NotificationParams } from "./params";

export const NOTIFICATION_EVENTS = [
  "submission_ready", "submission_failed", "submission_published", "submission_not_published", "list_published",
  "lead_received", "lead_quote_sent", "lead_expired", "claim_updated", "publication_orphaned",
] as const;
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

export type EventEntry = {
  /** Aceita canal externo (push/e-mail). `false` = só a central (ex.: aviso de admin). */
  external: boolean;
  /** Título GENÉRICO de push e e-mail (tela de bloqueio: sem escola, código ou status). */
  pushTitle: string;
  /** Texto da central (após login), montado só dos params permitidos. */
  title: (p: NotificationParams) => string;
  body: (p: NotificationParams) => string;
};

const CLAIM_BODY: Record<string, string> = {
  approved: "A reivindicação foi aprovada. Você já pode administrar a escola.",
  rejected: "A reivindicação não foi aprovada.",
  insufficient_evidence: "Precisamos de mais evidências para concluir a reivindicação.",
  token_expired: "O link de confirmação venceu. Peça um novo para continuar.",
};
const of = (p: NotificationParams): string => (p.school_name ? ` de ${p.school_name}` : "");

export const EVENT_CATALOG: Record<NotificationEvent, EventEntry> = {
  submission_ready: { external: true, pushTitle: "Sua lista foi lida", title: () => "Sua lista foi lida", body: (p) => `A leitura da lista${of(p)} terminou. Abra para conferir.` },
  submission_failed: { external: true, pushTitle: "Não foi possível ler sua lista", title: () => "Não foi possível ler sua lista", body: () => "Tente enviar de novo, de preferência com uma foto mais nítida ou um PDF." },
  submission_published: { external: true, pushTitle: "Sua lista foi publicada", title: () => "Sua lista foi publicada", body: (p) => `A lista${of(p)} já está publicada.` },
  submission_not_published: { external: true, pushTitle: "Sua lista não foi publicada", title: () => "Sua lista não foi publicada", body: () => "A equipe revisou o envio e ele não foi publicado. Abra para ver o que fazer." },
  list_published: {
    external: true,
    pushTitle: "A lista que você acompanha foi publicada",
    title: () => "A lista que você acompanha foi publicada",
    body: (p) => [p.school_name, p.grade_label, p.school_year?.toString()].filter(Boolean).join(" · ") || "Abra para ver a lista.",
  },
  lead_received: { external: true, pushTitle: "Você tem um novo pedido de cotação", title: () => "Novo pedido de cotação", body: (p) => `Pedido${p.lead_code ? ` ${p.lead_code}` : ""}. Abra para responder.` },
  lead_quote_sent: { external: true, pushTitle: "Sua cotação chegou", title: () => "Sua cotação chegou", body: (p) => `A papelaria respondeu ao pedido${p.lead_code ? ` ${p.lead_code}` : ""}.` },
  lead_expired: { external: true, pushTitle: "Seu pedido de cotação expirou", title: () => "Seu pedido de cotação expirou", body: (p) => `O pedido${p.lead_code ? ` ${p.lead_code}` : ""} passou do prazo. Você pode pedir de novo.` },
  claim_updated: { external: true, pushTitle: "Sua reivindicação teve uma atualização", title: () => "Atualização na sua reivindicação", body: (p) => (p.status_code && CLAIM_BODY[p.status_code]) || "Abra para ver o andamento." },
  publication_orphaned: { external: false, pushTitle: "Publicação para conciliar", title: () => "Publicação para conciliar", body: () => "Uma lista foi publicada sem registro no envio. Abra a revisão para conciliar." },
};
