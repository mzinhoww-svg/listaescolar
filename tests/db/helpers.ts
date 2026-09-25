import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";

// Porta do Postgres local: lida do config da trilha (.track-workdir, gerado por scripts/supa.mjs) ou do
// supabase/config.toml. Falha alto se o arquivo existir e a porta não for encontrada.
function localDbPort(): number {
  const candidates = [".track-workdir/supabase/config.toml", "supabase/config.toml"];
  for (const rel of candidates) {
    let toml: string;
    try {
      toml = readFileSync(resolve(process.cwd(), rel), "utf8");
    } catch {
      continue;
    }
    const match = /\[db\]\n(?:[^\n[][^\n]*\n|\n)*?port\s*=\s*(\d+)/.exec(toml);
    if (!match?.[1]) throw new Error(`porta do [db] não encontrada em ${rel}`);
    return Number(match[1]);
  }
  return 54322;
}

export const DATABASE_URL =
  process.env.SUPABASE_DB_URL ?? `postgresql://postgres:postgres@127.0.0.1:${localDbPort()}/postgres`;

// audit_log é append-only: rodar estes testes em banco remoto deixaria linhas permanentes.
const host = new URL(DATABASE_URL).hostname;
if (!["127.0.0.1", "localhost"].includes(host) && process.env.ALLOW_REMOTE_DB_TESTS !== "1") {
  throw new Error("Testes de banco só rodam em banco local (host 127.0.0.1 ou localhost).");
}

export type Identity =
  | "anon"
  | "parent"
  | "school_member"
  | "admin"
  | "stationery_member"
  | "system"
  | "system_profile" // perfil com role system logado como authenticated (não service_role)
  | "orphan";

/** Ids fixos dos usuários de teste. `orphan` e `spare` existem em auth.users, mas sem profile. */
export const IDS = {
  parent: "00000000-0000-4000-8000-000000000001",
  school_member: "00000000-0000-4000-8000-000000000002",
  admin: "00000000-0000-4000-8000-000000000003",
  stationery_member: "00000000-0000-4000-8000-000000000004",
  system: "00000000-0000-4000-8000-000000000005",
  orphan: "00000000-0000-4000-8000-000000000006",
  spare: "00000000-0000-4000-8000-000000000007",
} as const;

const PROFILE_ROLES = ["parent", "school_member", "admin", "stationery_member", "system"] as const;

/** Conexão superuser (postgres), fora de qualquer papel de teste. */
export async function withSuperuser<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/**
 * Executa `fn` numa transação com `set local role` e claims de JWT da identidade.
 * Sempre faz rollback.
 */
export async function withClaims<T>(
  identity: Identity,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  return withSuperuser(async (client) => {
    await client.query("begin");
    try {
      const dbRole =
        identity === "anon" ? "anon" : identity === "system" ? "service_role" : "authenticated";
      const claims: Record<string, string> = { role: dbRole };
      if (identity !== "anon" && identity !== "system") {
        claims.sub = identity === "system_profile" ? IDS.system : IDS[identity];
      }
      await client.query(`set local role ${dbRole}`);
      await client.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify(claims),
      ]);
      return await fn(client);
    } finally {
      await client.query("rollback");
    }
  });
}

/** Transação superuser (sem papel de teste) que sempre faz rollback. */
export async function inTx(fn: (client: Client) => Promise<void>): Promise<void> {
  await withSuperuser(async (c) => {
    await c.query("begin");
    try {
      await fn(c);
    } finally {
      await c.query("rollback");
    }
  });
}

export type Attempt = { error: string | null; code: string | null; rowCount: number; rows: Record<string, unknown>[] };

/** Roda um comando dentro de um savepoint, para a transação sobreviver a erros de RLS. */
export async function attempt(client: Client, sql: string, params: unknown[] = []): Promise<Attempt> {
  await client.query("savepoint attempt_sp");
  try {
    const res = await client.query(sql, params);
    await client.query("release savepoint attempt_sp");
    return { error: null, code: null, rowCount: res.rowCount ?? 0, rows: res.rows };
  } catch (e) {
    await client.query("rollback to savepoint attempt_sp");
    const err = e as { message: string; code?: string };
    return { error: err.message, code: err.code ?? null, rowCount: 0, rows: [] };
  }
}

/** Cria auth.users + profiles com ids fixos (idempotente). */
export async function seedUsers(): Promise<void> {
  await withSuperuser(async (client) => {
    await cleanupUsers();
    for (const role of PROFILE_ROLES) {
      await insertAuthUser(client, IDS[role], role);
      // com ou sem o trigger handle_new_user (0002): garante o profile com papel e nome.
      await client.query(
        `insert into public.profiles (id, role, display_name) values ($1, $2, $3)
         on conflict (id) do update set role = excluded.role, display_name = excluded.display_name`,
        [
          IDS[role],
          role,
          `Teste ${role}`,
        ],
      );
    }
    await insertAuthUser(client, IDS.orphan, "orphan");
    await insertAuthUser(client, IDS.spare, "spare");
    // orphan e spare devem ficar sem profile (o trigger criou um).
    await client.query("delete from public.profiles where id = any($1::uuid[])", [[IDS.orphan, IDS.spare]]);
  });
}

/** Remove os usuários de teste (profiles saem por cascade). O audit_log é append-only e fica. */
export async function cleanupUsers(): Promise<void> {
  await withSuperuser(async (client) => {
    await client.query("delete from auth.users where id = any($1::uuid[])", [Object.values(IDS)]);
  });
}

async function insertAuthUser(client: Client, id: string, label: string): Promise<void> {
  await client.query(
    `insert into auth.users (id, aud, role, email) values ($1, 'authenticated', 'authenticated', $2)`,
    [id, `${label}@teste.invalid`],
  );
}

export type StationeryStatus =
  | "signup"
  | "accreditation"
  | "under_review"
  | "approved"
  | "active"
  | "paused"
  | "suspended"
  | "rejected";

export type SeedStationery = {
  status?: StationeryStatus;
  /** perfil que vira owner (member_role = 'owner'); omitido = sem membro. */
  ownerId?: string;
  pausedBy?: "owner" | "admin" | null;
  complete?: boolean; // dados que as pré-condições do dono exigem (padrão true)
  overrides?: Record<string, unknown>;
};

let stationerySeq = 0;

/**
 * Cria uma papelaria (e o owner) como superuser, mesmo dentro de uma transação de withClaims:
 * sai do papel de teste, insere e volta ao papel anterior. Devolve o id.
 */
export async function seedStationery(client: Client, opts: SeedStationery = {}): Promise<string> {
  const prev = (await client.query("select current_user as u")).rows[0].u as string;
  await client.query("reset role");
  try {
    stationerySeq += 1;
    const n = `${Date.now() % 1_000_000_000}${stationerySeq}`.padStart(14, "0").slice(-14);
    const muni = await client.query("select id from public.municipalities order by ibge_code limit 1");
    const complete = opts.complete ?? true;
    const row: Record<string, unknown> = {
      slug: `papelaria-${n}`,
      trade_name: "Papelaria Teste",
      legal_name: complete ? "Papelaria Teste LTDA" : null,
      cnpj: n,
      status: opts.status ?? "signup",
      municipality_id: muni.rows[0].id,
      neighborhood: complete ? "Centro" : null,
      address: "Rua Teste, 1",
      cep: "78005000",
      whatsapp: complete ? "+5565999990000" : null,
      phone: "+556533330000",
      email: "contato@papelaria-teste.invalid",
      offers_pickup: complete,
      offers_delivery: false,
      lgpd_accepted_at: complete ? new Date().toISOString() : null,
      lgpd_text_version: complete ? "v1" : null,
      paused_by: opts.pausedBy ?? null,
      ...opts.overrides,
    };
    const cols = Object.keys(row);
    const res = await client.query(
      `insert into public.stationeries (${cols.join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")}) returning id`,
      cols.map((k) => row[k]),
    );
    const id = res.rows[0].id as string;
    if (opts.ownerId) {
      await client.query(
        `insert into public.stationery_members (stationery_id, profile_id, member_role) values ($1, $2, 'owner')`,
        [id, opts.ownerId],
      );
    }
    return id;
  } finally {
    await client.query(`set local role ${prev}`);
  }
}
