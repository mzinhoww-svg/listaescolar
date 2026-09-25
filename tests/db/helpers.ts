import { Client } from "pg";

export const DATABASE_URL =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

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
      if (identity !== "anon" && identity !== "system") claims.sub = IDS[identity];
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
      await client.query("insert into public.profiles (id, role, display_name) values ($1, $2, $3)", [
        IDS[role],
        role,
        `Teste ${role}`,
      ]);
    }
    await insertAuthUser(client, IDS.orphan, "orphan");
    await insertAuthUser(client, IDS.spare, "spare");
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
