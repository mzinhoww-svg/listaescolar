import { createHmac, randomBytes, randomInt } from "node:crypto";
import type { Client } from "pg";

import { IDS, withSuperuser } from "./helpers";
import { seedCandidate, seedList, seedSchool, transition, publish } from "./list-fixtures";

// Fixtures da S24 (parceiros B2B, chaves e leitura pública). Tudo por SQL direto (superuser) ou pelas funções reais.
// O hash da chave é HMAC-SHA256(pepper, segredo) calculado AQUI, como o servidor faz (o pepper nunca vai ao banco).

export const TEST_PEPPER = "pepper-de-teste-com-mais-de-32-caracteres-0001";
export const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export type PartnerType = "retailer" | "brand" | "edtech";
export type PartnerStatus = "pending" | "sandbox" | "active" | "rejected" | "suspended";

export function makeCnpj14(): string {
  // 12 dígitos aleatórios + DVs válidos (os testes de banco só exigem o formato; o DV é do domínio).
  const base = Array.from({ length: 12 }, () => String(randomInt(0, 10))).join("");
  const W1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const W2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const dv = (vals: number[], w: number[]) => {
    const r = vals.reduce((acc, v, i) => acc + v * (w[i] ?? 0), 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const vals = [...base].map((ch) => ch.charCodeAt(0) - 48);
  const d1 = dv(vals, W1);
  const d2 = dv([...vals, d1], W2);
  return `${base}${d1}${d2}`;
}

export function publicId(): string {
  return Array.from({ length: 12 }, () => CROCKFORD[randomInt(0, CROCKFORD.length)]).join("");
}

export function secret(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSecret(s: string, pepper = TEST_PEPPER): string {
  return createHmac("sha256", pepper).update(s).digest("hex");
}

export type SeedPartner = {
  status?: PartnerStatus;
  type?: PartnerType;
  ownerId?: string | null;
  plan?: string | null;
  coverageUfs?: string[] | null;
  limits?: { testMinute?: number; testDay?: number; liveMinute?: number; liveDay?: number };
  overrides?: Record<string, unknown>;
};

/** Cria um parceiro (e o dono) como superuser, mesmo dentro de uma transação com papel de teste. Devolve o id. */
export async function seedPartner(c: Client, opts: SeedPartner = {}): Promise<string> {
  const prev = (await c.query("select current_user as u")).rows[0].u as string;
  await c.query("reset role");
  try {
    const status = opts.status ?? "pending";
    const approved = status === "sandbox" || status === "active" || status === "suspended";
    const row: Record<string, unknown> = {
      trade_name: "Parceiro Teste",
      legal_name: "Parceiro Teste LTDA",
      cnpj: makeCnpj14(),
      contact_name: "Contato Teste",
      partner_type: opts.type ?? "retailer",
      status,
      plan: opts.plan === undefined ? (approved ? "regional" : null) : opts.plan,
      coverage_ufs: opts.coverageUfs === undefined ? (approved ? ["MT"] : null) : opts.coverageUfs,
      test_rate_per_minute: approved ? (opts.limits?.testMinute ?? 60) : null,
      test_rate_per_day: approved ? (opts.limits?.testDay ?? 1000) : null,
      live_rate_per_minute: status === "active" || status === "suspended" ? (opts.limits?.liveMinute ?? 120) : null,
      live_rate_per_day: status === "active" || status === "suspended" ? (opts.limits?.liveDay ?? 5000) : null,
      terms_text_version: "b2b-api-terms-test",
      status_reason: status === "rejected" || status === "suspended" ? "motivo de teste" : null,
      ...opts.overrides,
    };
    const cols = Object.keys(row);
    const r = await c.query(
      `insert into public.b2b_partners (${cols.join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")}) returning id`,
      cols.map((k) => row[k]),
    );
    const id = r.rows[0].id as string;
    const owner = opts.ownerId === undefined ? IDS.parent : opts.ownerId;
    if (owner) {
      await c.query("insert into public.b2b_partner_members (partner_id, profile_id, member_role) values ($1, $2, 'owner')", [id, owner]);
    }
    return id;
  } finally {
    await c.query(`set local role ${prev}`).catch(() => undefined);
  }
}

export type SeedKey = {
  environment?: "test" | "live";
  scopes?: string[];
  status?: "active" | "revoked";
  expiresAt?: string | null; // intervalo SQL somado a now(); null = sem expiração
  publicId?: string;
  secret?: string;
  overrides?: Record<string, unknown>;
};

/** Insere uma chave direto (superuser). Devolve id, public_id e o segredo em claro (só teste). */
export async function seedKey(c: Client, partnerId: string, opts: SeedKey = {}): Promise<{ id: string; publicId: string; secret: string; plaintext: string }> {
  const prev = (await c.query("select current_user as u")).rows[0].u as string;
  await c.query("reset role");
  try {
    const env = opts.environment ?? "test";
    const pid = opts.publicId ?? publicId();
    const sec = opts.secret ?? secret();
    const status = opts.status ?? "active";
    const row: Record<string, unknown> = {
      partner_id: partnerId,
      environment: env,
      public_id: pid,
      key_hash: hashSecret(sec),
      hash_version: 1,
      last4: sec.slice(-4),
      scopes: opts.scopes ?? ["schools:read", "lists:read", "carts:match"],
      status,
      created_by: IDS.parent,
      // status = revoked exige revoked_at (constraint b2b_api_keys_revoked_pair); overrides pode substituir.
      revoked_at: status === "revoked" ? new Date().toISOString() : null,
      ...opts.overrides,
    };
    const cols = Object.keys(row);
    const vals = cols.map((k) => row[k]);
    const exp = opts.expiresAt === undefined || opts.expiresAt === null ? "null" : `now() + $${cols.length + 1}::interval`;
    const r = await c.query(
      `insert into public.b2b_api_keys (${cols.join(",")}, expires_at) values (${cols.map((_, i) => `$${i + 1}`).join(",")}, ${exp}) returning id`,
      opts.expiresAt === undefined || opts.expiresAt === null ? vals : [...vals, opts.expiresAt],
    );
    return { id: r.rows[0].id as string, publicId: pid, secret: sec, plaintext: `lc_${env}_${pid}_${sec}` };
  } finally {
    await c.query(`set local role ${prev}`).catch(() => undefined);
  }
}

export type PublicListSeed = { schoolId: string; listId: string; versionId: string; inep: string };

/**
 * Escola + lista publicada pela função real da S05 (`list_publish_version`), com `is_demo` da escola e da lista
 * conforme pedido. Município habilitado (Cuiabá) por padrão.
 */
export async function seedPublishedList(
  c: Client,
  opts: { inep?: string; demo?: boolean; slug?: string; year?: number; enabledMunicipality?: boolean; items?: number; schoolId?: string } = {},
): Promise<PublicListSeed> {
  const inep = opts.inep ?? String(52_000_000 + randomInt(0, 900_000));
  const schoolId = opts.schoolId ?? (await seedSchool(c, inep, opts.enabledMunicipality ?? true));
  if (opts.demo !== undefined) await c.query("update public.schools set is_demo = $2 where id = $1", [schoolId, opts.demo]);
  const listId = await seedList(c, schoolId, opts.slug ?? "ef-1", opts.year ?? 2027);
  await c.query("update public.school_lists set is_demo = $2 where id = $1", [listId, opts.demo ?? true]);
  const versionId = await seedCandidate(c, listId, opts.items ?? 2);
  for (const s of ["submitted", "processing", "approved"] as const) await transition(c, listId, s);
  await publish(c, listId, versionId);
  return { schoolId, listId, versionId, inep };
}

/** Remove parceiros (e o que depende deles) de testes que confirmaram dados. Eventos são imutáveis: usa replica. */
export async function purgePartners(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  await withSuperuser(async (c) => {
    await c.query("begin");
    try {
      await c.query("set local session_replication_role = replica");
      await c.query("delete from public.b2b_usage_daily where partner_id = any($1::uuid[])", [ids]);
      await c.query("delete from public.b2b_rate_windows where partner_id = any($1::uuid[])", [ids]);
      await c.query("delete from public.b2b_partner_events where partner_id = any($1::uuid[])", [ids]);
      await c.query("delete from public.b2b_api_keys where partner_id = any($1::uuid[])", [ids]);
      await c.query("delete from public.b2b_partner_members where partner_id = any($1::uuid[])", [ids]);
      await c.query("delete from public.consents where id in (select terms_consent_id from public.b2b_partners where id = any($1::uuid[]))", [ids]);
      await c.query("delete from public.b2b_partners where id = any($1::uuid[])", [ids]);
      await c.query("commit");
    } catch (e) {
      await c.query("rollback");
      throw e;
    }
  });
}

/** Chama uma função `b2b_*` como service_role (sai do papel atual e volta). */
export async function callAsService<T = Record<string, unknown>>(c: Client, sql: string, params: unknown[] = []): Promise<T[]> {
  const prev = (await c.query("select current_user as u")).rows[0].u as string;
  await c.query("reset role");
  await c.query("set local role service_role");
  await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "service_role" })]);
  try {
    const r = await c.query(sql, params);
    return r.rows as T[];
  } finally {
    await c.query("reset role");
    await c.query(`set local role ${prev}`).catch(() => undefined);
  }
}
