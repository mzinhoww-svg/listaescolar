import { createHash, randomUUID } from "node:crypto";
import type { Client } from "pg";
import { CUIABA_IBGE, GOIANIA_IBGE } from "./list-fixtures";
import { IDS } from "./helpers";

export const sha = (s: string): string => createHash("sha256").update(s).digest("hex");

export type ClaimMethod = "institutional_email" | "institutional_whatsapp" | "documents";
export const CLAIM_STATUSES = [
  "submitted", "awaiting_verification", "token_expired", "insufficient_evidence", "rejected", "approved",
] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];
export const CLAIM_ACTORS = ["claimant", "admin", "system"] as const;
export type ClaimActor = (typeof CLAIM_ACTORS)[number];

/** Matriz esperada (plano S06), escrita à mão de propósito: é o oráculo independente do SQL. */
export const CLAIM_ORACLE: Record<ClaimActor, Array<[ClaimStatus, ClaimStatus]>> = {
  claimant: [
    ["submitted", "awaiting_verification"],
    ["token_expired", "awaiting_verification"],
    ["insufficient_evidence", "awaiting_verification"],
  ],
  admin: [
    ["awaiting_verification", "approved"],
    ["awaiting_verification", "insufficient_evidence"],
    ["submitted", "rejected"],
    ["awaiting_verification", "rejected"],
    ["insufficient_evidence", "rejected"],
    ["token_expired", "rejected"],
  ],
  system: [
    ["awaiting_verification", "token_expired"],
    ["submitted", "rejected"],
    ["awaiting_verification", "rejected"],
    ["insufficient_evidence", "rejected"],
    ["token_expired", "rejected"],
  ],
};

export const SCHOOL_EMAIL = "diretoria@escola-teste.invalid";
export const SCHOOL_PHONE = "65999990001";
export const CLAIMANT_NAME = "Maria da Silva Santos";
export const CLAIMANT_TITLE = "Diretora Pedagógica";
/** E-mail da sessão do reivindicante (auth.users do seedUsers: `<papel>@teste.invalid`); o banco o copia. */
export const CLAIMANT_EMAIL = "parent@teste.invalid";
export const CLAIM_NOTE = "Sou a diretora desde 2020, nota interna";

type SchoolOpts = {
  inep?: string;
  email?: string | null;
  phone?: string | null;
  status?: "registered" | "claimed" | "verified" | "suspended";
  demo?: boolean;
  enabled?: boolean;
};

/** Escola de teste (superuser: o gatilho 0104 só deixa o dono semear claimed/verified). */
export async function seedClaimSchool(c: Client, o: SchoolOpts = {}): Promise<string> {
  const enabled = o.enabled ?? true;
  if (!enabled) {
    await c.query(
      `insert into public.municipalities (ibge_code, uf, name, is_enabled) values ($1, 'GO', 'Goiânia', false)
       on conflict do nothing`,
      [GOIANIA_IBGE],
    );
  }
  const r = await c.query<{ id: string }>(
    `insert into public.schools (inep, name, normalized_name, network, municipality_id, email, phone, verification_status, is_demo)
     select $1, 'Escola Reivindicação Teste', 'escola reivindicacao teste', 'municipal', m.id, $3, $4, $5::public.verification_status, $6
       from public.municipalities m where m.ibge_code = $2 returning id`,
    [
      o.inep ?? "51999801",
      enabled ? CUIABA_IBGE : GOIANIA_IBGE,
      o.email === undefined ? SCHOOL_EMAIL : o.email,
      o.phone === undefined ? SCHOOL_PHONE : o.phone,
      o.status ?? "registered",
      o.demo ?? false,
    ],
  );
  return r.rows[0]!.id;
}

/** Garante um perfil (papel dado) para usuários de auth que o seedUsers deixa sem profile. */
export async function ensureProfile(c: Client, id: string, role = "parent"): Promise<void> {
  await c.query(
    `insert into public.profiles (id, role) values ($1, $2::public.user_role)
     on conflict (id) do update set role = excluded.role`,
    [id, role],
  );
}

export type ClaimOpts = { claimant?: string; method?: ClaimMethod; note?: string | null; name?: string };

export async function createClaim(c: Client, schoolId: string, o: ClaimOpts = {}): Promise<string> {
  const r = await c.query<{ id: string }>(
    "select public.claim_create($1, $2, $3::public.claim_method, $4, $5, $6, 'v1') as id",
    [
      schoolId,
      o.claimant ?? IDS.parent,
      o.method ?? "documents",
      o.name ?? CLAIMANT_NAME,
      CLAIMANT_TITLE,
      o.note === undefined ? CLAIM_NOTE : o.note,
    ],
  );
  return r.rows[0]!.id;
}

export function evidencePath(claimId: string, ext = "pdf"): string {
  return `${claimId}/${randomUUID()}.${ext}`;
}
const MIME: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", png: "image/png" };

export async function addEvidence(c: Client, claimId: string, actor: string = IDS.parent, ext = "pdf"): Promise<{ id: string; path: string }> {
  const path = evidencePath(claimId, ext);
  const r = await c.query<{ id: string }>(
    "select public.claim_add_evidence($1, $2, $3, $4, 1234, $5, 'documento.pdf') as id",
    [claimId, actor, path, MIME[ext], sha(path)],
  );
  return { id: r.rows[0]!.id, path };
}

export async function submit(c: Client, claimId: string, actor: string = IDS.parent, note: string | null = null): Promise<void> {
  await c.query("select public.claim_submit_for_review($1, $2, $3)", [claimId, actor, note]);
}

/** Reivindicação por documentos já em awaiting_verification. */
export async function docsAwaiting(c: Client, schoolId: string, claimant: string = IDS.parent): Promise<string> {
  const id = await createClaim(c, schoolId, { claimant, method: "documents" });
  await addEvidence(c, id, claimant);
  await submit(c, id, claimant);
  return id;
}

export type IssuedToken = { token_id: string; expires_at: Date; channel: string; destination: string };

export async function issueToken(c: Client, claimId: string, hash: string, actor: string = IDS.parent): Promise<IssuedToken> {
  const r = await c.query<IssuedToken>("select * from public.claim_issue_token($1, $2, $3)", [claimId, actor, hash]);
  return r.rows[0]!;
}

export async function confirm(c: Client, hash: string, actor: string = IDS.parent, claimId: string | null = null): Promise<string> {
  const r = await c.query<{ r: string }>("select public.claim_confirm_token($1, $2, $3) as r", [hash, actor, claimId]);
  return r.rows[0]!.r;
}

export async function decide(
  c: Client, claimId: string, to: ClaimStatus, reason: string | null = "Motivo de teste", actor: string = IDS.admin,
): Promise<void> {
  await c.query("select public.claim_decide($1, $2::public.claim_status, $3, $4)", [claimId, to, actor, reason]);
}

export async function statusOf(c: Client, claimId: string): Promise<string> {
  return (await c.query<{ status: string }>("select status::text from public.claims where id = $1", [claimId])).rows[0]!.status;
}

export async function schoolStatus(c: Client, schoolId: string): Promise<string> {
  return (await c.query<{ s: string }>("select verification_status::text as s from public.schools where id = $1", [schoolId])).rows[0]!.s;
}

/** Recua o relógio dos tokens da reivindicação (created_at e expires_at) para testar intervalos e validade. */
export async function backdateTokens(c: Client, claimId: string, seconds: number): Promise<void> {
  await c.query(
    `update public.claim_tokens set created_at = created_at - make_interval(secs => $2), expires_at = expires_at - make_interval(secs => $2)
      where claim_id = $1`,
    [claimId, seconds],
  );
}

export async function eventsOf(c: Client, claimId: string): Promise<string[]> {
  const r = await c.query<{ e: string }>(
    `select coalesce(from_status::text, '-') || '>' || to_status::text || ':' || actor_kind::text as e
       from public.claim_status_events where claim_id = $1 order by created_at, id`,
    [claimId],
  );
  return r.rows.map((x) => x.e);
}
