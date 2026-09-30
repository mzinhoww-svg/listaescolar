import { CLAIM_STATE_LABEL, LEAD_STATE_LABEL, LIST_STATE_LABEL, SCHOOL_STATE_LABEL, STATIONERY_STATE_LABEL } from "@/features/admin/labels";

/**
 * Apresentação da trilha de auditoria (UX-108). Só texto: nenhuma regra de negócio, nenhum acesso a dados.
 * Valor desconhecido nunca vira JSON cru: cai em texto simples (sublinhado vira espaço) ou "conteúdo estruturado".
 */

const ACTION_LABEL: Record<string, string> = { INSERT: "Criado", UPDATE: "Alterado", DELETE: "Removido" };

const TABLE_LABEL: Record<string, string> = {
  ai_settings: "Ajustes de IA",
  b2b_api_keys: "Chave de API",
  b2b_campaign_events: "Evento de campanha",
  b2b_campaigns: "Campanha",
  b2b_partner_members: "Membro de parceiro",
  b2b_partners: "Parceiro",
  b2b_statements: "Extrato de parceiro",
  billing_payment_alerts: "Alerta de pagamento",
  catalog_items: "Item de catálogo",
  claim_evidence: "Evidência de reivindicação",
  claim_tokens: "Confirmação de reivindicação",
  claims: "Reivindicação",
  consents: "Consentimento",
  invoices: "Fatura",
  lead_disputes: "Contestação",
  lead_purchase_confirmations: "Confirmação de compra",
  lead_reviews: "Avaliação",
  leads: "Pedido de cotação",
  list_submissions: "Envio de lista",
  list_versions: "Versão de lista",
  municipalities: "Município",
  payout_batches: "Lote de repasse",
  payout_settings: "Regras de repasse",
  plan_credit_packages: "Pacote de créditos",
  plan_price_tiers: "Faixa de preço do plano",
  plans: "Plano",
  price_snapshots: "Preço registrado",
  profiles: "Perfil",
  prompt_registry: "Instrução de IA",
  reports: "Denúncia",
  retailers: "Varejista",
  school_lists: "Lista escolar",
  school_members: "Membro de escola",
  school_payout_settings: "Repasse da escola",
  schools: "Escola",
  season_passes: "Passe de temporada",
  stationeries: "Papelaria",
  stationery_members: "Membro de papelaria",
  stationery_wallets: "Créditos da papelaria",
};

const FIELD_LABEL: Record<string, string> = {
  status: "Situação",
  is_demo: "Dados demonstrativos",
  is_active: "Ativo",
  is_enabled: "Habilitado",
  role: "Papel",
  reason: "Motivo",
  resolution: "Decisão",
  resolution_reason: "Motivo da decisão",
  resolution_note: "Observação da decisão",
  decided_by: "Decidido por",
  decided_at: "Decidido em",
  resolved_by: "Resolvido por",
  resolved_at: "Resolvido em",
  trade_name: "Nome fantasia",
  legal_name: "Razão social",
  name: "Nome",
  neighborhood: "Bairro",
  paused_by: "Pausada por",
  school_id: "Escola",
  stationery_id: "Papelaria",
  list_id: "Lista",
  current_version_id: "Versão atual",
  published_at: "Publicada em",
  verification_state: "Verificação",
  plan_id: "Plano",
  partner_id: "Parceiro",
};

const VALUE_LABEL: Record<string, string> = {
  ...LIST_STATE_LABEL,
  ...SCHOOL_STATE_LABEL,
  ...CLAIM_STATE_LABEL,
  ...LEAD_STATE_LABEL,
  ...STATIONERY_STATE_LABEL,
  pending: "Pendente",
  sandbox: "Sandbox",
  open: "Aberta",
  in_review: "Em análise",
  resolved: "Resolvida",
  dismissed: "Descartada",
  rejected: "Recusada",
  approved: "Aprovada",
  active: "Ativa",
};

const ROLE_LABEL: Record<string, string> = {
  admin: "Equipe",
  system: "Sistema",
  parent: "Família",
  school_member: "Escola",
  stationery_member: "Papelaria",
};

const HIDDEN_FIELDS = new Set(["id", "created_at", "updated_at"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const MAX = 80;

const plain = (s: string): string => s.replace(/_/g, " ");

export const actionLabel = (a: string): string => ACTION_LABEL[a] ?? plain(a.toLowerCase());
export const tableLabel = (t: string): string => TABLE_LABEL[t] ?? plain(t);
export const KNOWN_TABLES: readonly { value: string; label: string }[] = Object.entries(TABLE_LABEL)
  .map(([value, label]) => ({ value, label }))
  .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
export const ACTION_OPTIONS: readonly { value: string; label: string }[] = Object.entries(ACTION_LABEL).map(([value, label]) => ({ value, label }));

export function actorLabel(a: { actorId: string | null; actorRole: string | null; actorName: string | null }): { primary: string; secondary: string } {
  if (!a.actorId) return { primary: "Sistema", secondary: "Ação automática" };
  const role = ROLE_LABEL[a.actorRole ?? ""] ?? "Usuário";
  if (a.actorName) return { primary: a.actorName, secondary: role };
  return { primary: role, secondary: "Nome indisponível" };
}

function value(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") {
    if (VALUE_LABEL[v]) return VALUE_LABEL[v];
    if (UUID.test(v)) return `${v.slice(0, 8)}…`;
    if (ISO.test(v) && !Number.isNaN(Date.parse(v))) {
      return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Cuiaba" }).format(new Date(v));
    }
    const s = plain(v);
    return s.length > MAX ? `${s.slice(0, MAX)}…` : s;
  }
  return "conteúdo estruturado";
}

export type ChangeRow = { label: string; before: string | null; after: string | null };

const asObject = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** UPDATE: só os campos que mudaram. INSERT: campos preenchidos. DELETE: campos que existiam. */
export function describeChanges(action: string, before: unknown, after: unknown): ChangeRow[] {
  const b = asObject(before);
  const a = asObject(after);
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].filter((k) => !HIDDEN_FIELDS.has(k));
  const rows: ChangeRow[] = [];
  for (const k of keys) {
    const bv = action === "INSERT" ? null : value(b[k]);
    const av = action === "DELETE" ? null : value(a[k]);
    if (bv === null && av === null) continue;
    if (action === "UPDATE" && JSON.stringify(b[k]) === JSON.stringify(a[k])) continue;
    rows.push({ label: FIELD_LABEL[k] ?? plain(k), before: bv, after: av });
  }
  return rows;
}
