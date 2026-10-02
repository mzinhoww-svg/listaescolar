import "server-only";

import { z } from "zod";

import type { SessionActor } from "@/features/auth/actor";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { availableMethods } from "./channels";
import { ClaimRepositoryError } from "./repository";
import { getClaimTokenSender, type SenderEnv } from "./senders";
import { inepSchema, uuidSchema } from "./schemas";
import { CLAIM_COLUMNS, adminRepo, claimRow, eventsAndEvidence, requireActor, toClaimView, type Deps } from "./queries-shared";
import { OPEN_CLAIM_STATUSES } from "./state";
import { verificationStatusSchema, type ClaimStatusView, type ClaimView, type SchoolClaimContext, type VerificationStatus } from "./types";

/**
 * Leituras de reivindicação. O reivindicante lê pelo cliente de SESSÃO (RLS + grants por coluna, sem `decided_by`);
 * a fila e a visão do admin usam o service role só depois de conferir `role === 'admin'` (o admin via `authenticated`
 * não lê `decided_by`/`actor_id`). Nada aqui devolve `schools.email`/`phone`, `storage_path` nem hash de token.
 *
 * D-057 (S18): a fila (`listClaimQueue`) e a visão completa do admin (`getClaimForAdmin`) foram extraídas para
 * `queries-admin.ts` (arquivo-irmão) e são reexportadas abaixo — mesmo caminho de import (`@/features/claims/
 * queries`) para quem chama, comportamento idêntico. As peças usadas pelos dois lados (`Deps`, `adminRepo`,
 * `status`, `CLAIM_COLUMNS`, `claimRow`, `eventsAndEvidence`, ...) vivem em `queries-shared.ts` para os dois
 * arquivos poderem importar sem um depender do outro (import circular dava `undefined` em tempo de módulo).
 */
export type { Deps };

/** A reivindicação mais relevante do ator para a escola (aberta primeiro, senão a mais recente). */
export async function getMyClaimForSchool(actor: SessionActor, inep: string, deps: Deps = {}): Promise<ClaimView | null> {
  requireActor(actor);
  if (!inepSchema.safeParse(inep).success) return null;
  const session = deps.session ?? (await createClient());
  const school = await session.from("schools").select("id").eq("inep", inep).maybeSingle();
  const schoolId = z.object({ id: z.uuid() }).safeParse(school.data);
  if (!schoolId.success) return null;
  const { data, error } = await session
    .from("claims")
    .select(CLAIM_COLUMNS)
    .eq("school_id", schoolId.data.id)
    .eq("claimant_id", actor.userId)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw new ClaimRepositoryError("database", "consulta: database");
  const rows = z.array(claimRow).parse(data);
  const open = rows.find((r) => OPEN_CLAIM_STATUSES.includes(r.status));
  const pick = open ?? rows[0];
  return pick ? toClaimView(pick) : null;
}

/** Estado, linha do tempo e evidências (metadados) da própria reivindicação. Expira token vencido antes de ler. */
export async function getClaimStatusView(actor: SessionActor, claimId: string, deps: Deps = {}): Promise<ClaimStatusView | null> {
  requireActor(actor);
  if (!uuidSchema.safeParse(claimId).success) return null;
  const session = deps.session ?? (await createClient());
  const first = await session.from("claims").select("id").eq("id", claimId).eq("claimant_id", actor.userId).maybeSingle();
  if (first.error || !first.data) return null;
  const repo = deps.repo ?? adminRepo(deps, deps.admin ?? createAdminClient());
  await repo.expireTokens(actor, claimId);
  const { data, error } = await session.from("claims").select(CLAIM_COLUMNS).eq("id", claimId).eq("claimant_id", actor.userId).maybeSingle();
  if (error || !data) return null;
  return { ...toClaimView(claimRow.parse(data)), ...(await eventsAndEvidence(session, claimId)) };
}

const schoolRow = z.object({
  id: z.uuid(),
  inep: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  verification_status: verificationStatusSchema,
  is_demo: z.boolean(),
  municipalities: z.object({ name: z.string(), is_enabled: z.boolean() }),
});

const BLOCK: Partial<Record<VerificationStatus, string>> = {
  verified: "Esta escola já tem administrador. O pedido de acesso adicional ainda não está disponível.",
  suspended: "Esta escola não aceita pedidos no momento.",
};

/**
 * Escola encontrada no cadastro do INEP + métodos disponíveis. Lê `email`/`phone` com service role só para decidir
 * a disponibilidade; NUNCA os devolve. `null` = escola inexistente ou município não habilitado (404).
 */
export async function getSchoolClaimContext(inep: string, deps: Deps & { env?: SenderEnv } = {}): Promise<SchoolClaimContext | null> {
  if (!inepSchema.safeParse(inep).success) return null;
  const admin = deps.admin ?? createAdminClient();
  const { data, error } = await admin
    .from("schools")
    .select("id, inep, name, email, phone, verification_status, is_demo, municipalities!inner(name, is_enabled)")
    .eq("inep", inep)
    .maybeSingle();
  if (error) throw new ClaimRepositoryError("database", "consulta: database");
  const parsed = schoolRow.safeParse(data);
  if (!parsed.success || !parsed.data.municipalities.is_enabled) return null;
  const s = parsed.data;
  const sender = getClaimTokenSender(deps.env ?? { DEMO_CLAIM_DELIVERY: process.env.DEMO_CLAIM_DELIVERY, APP_ENV: process.env.APP_ENV, VERCEL_ENV: process.env.VERCEL_ENV }, { isDemo: s.is_demo });
  return {
    school: { id: s.id, inep: s.inep, name: s.name, municipality: s.municipalities.name, verificationStatus: s.verification_status, isDemo: s.is_demo },
    blockedReason: BLOCK[s.verification_status] ?? null,
    methods: availableMethods({ hasEmail: Boolean(s.email), phone: s.phone, sender }),
  };
}

export { getClaimForAdmin, listClaimQueue } from "./queries-admin";
