import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { attempt, cleanupUsers, seedUsers, withClaims, withSuperuser } from "./helpers";

const DISABLED_IBGE = "5208707";
const CUIABA = "5103403";

type Row = Record<string, unknown>;
const row = (n: number, inep: string | null, name: string, extra: Row = {}): Row => ({
  row_number: n,
  inep,
  name,
  normalized_name: name.toLowerCase(),
  network: "municipal",
  neighborhood: "Centro",
  address: "Rua A, 1",
  cep: "78000000",
  phone: "6533330000",
  email: "escola@escola.invalid",
  ibge_code: CUIABA,
  is_demo: false,
  ...extra,
});

type Totals = { inserted: number; updated: number; duplicate: number; rejected: number };

async function newBatch(c: Client): Promise<string> {
  const r = await c.query<{ id: string }>(
    "insert into public.import_batches (file_name, file_hash) values ('t.csv', $1) returning id",
    [randomUUID()],
  );
  return r.rows[0]?.id ?? "";
}
async function apply(c: Client, batch: string, rows: Row[]): Promise<Totals> {
  const r = await c.query<{ r: Totals }>("select public.import_apply_rows($1, $2::jsonb) as r", [
    batch,
    JSON.stringify(rows),
  ]);
  return r.rows[0]?.r as Totals;
}
async function actions(c: Client, batch: string): Promise<Record<number, { action: string; errors: { code: string }[] }>> {
  const r = await c.query<{ row_number: number; action: string; errors: { code: string }[] }>(
    "select row_number, action, errors from public.import_rows where batch_id = $1",
    [batch],
  );
  return Object.fromEntries(r.rows.map((x) => [x.row_number, { action: x.action, errors: x.errors }]));
}
async function seedSchool(
  c: Client,
  inep: string,
  name: string,
  status = "registered",
  ibge = CUIABA,
): Promise<void> {
  await c.query(
    `insert into public.schools (inep, name, normalized_name, network, municipality_id, verification_status)
     select $1, $2, $3, 'municipal', m.id, $4::public.verification_status from public.municipalities m where m.ibge_code = $5`,
    [inep, name, name.toLowerCase(), status, ibge],
  );
}

describe("import_apply_rows e import_claim_batch", () => {
  beforeAll(async () => {
    await seedUsers();
    await withSuperuser((c) =>
      c.query(
        `insert into public.municipalities (ibge_code, uf, name, is_enabled)
         values ($1, 'GO', 'Goiânia', false) on conflict do nothing`,
        [DISABLED_IBGE],
      ),
    );
  });
  afterAll(async () => {
    await withSuperuser((c) => c.query("delete from public.municipalities where ibge_code = $1", [DISABLED_IBGE]));
    await cleanupUsers();
  });

  it("insere escola nova como registered/inep_import ligada ao lote", async () => {
    await withClaims("system", async (c) => {
      const b = await newBatch(c);
      const t = await apply(c, b, [row(1, "51000001", "Escola Um")]);
      expect(t).toEqual({ inserted: 1, updated: 0, duplicate: 0, rejected: 0 });
      const s = await c.query(
        `select s.verification_status, s.registry_source, s.source_batch_id, s.network, s.normalized_name, s.email,
                m.ibge_code from public.schools s join public.municipalities m on m.id = s.municipality_id
         where s.inep = '51000001'`,
      );
      expect(s.rows[0]).toMatchObject({
        verification_status: "registered",
        registry_source: "inep_import",
        source_batch_id: b,
        network: "municipal",
        normalized_name: "escola um",
        email: "escola@escola.invalid",
        ibge_code: CUIABA,
      });
      expect((await actions(c, b))[1]?.action).toBe("inserted");
      const bt = await c.query("select inserted_count, total_rows, status from public.import_batches where id = $1", [b]);
      expect(bt.rows[0]).toMatchObject({ inserted_count: 1, total_rows: 1, status: "processing" });
    });
  });

  it("propaga is_demo da linha para a escola", async () => {
    await withClaims("system", async (c) => {
      const b = await newBatch(c);
      await apply(c, b, [row(1, "51000001", "Escola Demo", { is_demo: true })]);
      const s = await c.query("select is_demo from public.schools where inep = '51000001'");
      expect(s.rows[0]?.is_demo).toBe(true);
    });
  });

  it("atualiza escola existente sem mexer em verification_status (verified permanece)", async () => {
    await withClaims("system", async (c) => {
      await seedSchool(c, "51000001", "Nome Antigo", "verified");
      const b = await newBatch(c);
      const t = await apply(c, b, [row(1, "51000001", "Nome Novo", { address: "Rua Nova, 9" })]);
      expect(t).toEqual({ inserted: 0, updated: 1, duplicate: 0, rejected: 0 });
      const s = await c.query(
        "select name, normalized_name, address, verification_status, source_batch_id from public.schools where inep = '51000001'",
      );
      expect(s.rows[0]).toMatchObject({
        name: "Nome Novo",
        normalized_name: "nome novo",
        address: "Rua Nova, 9",
        verification_status: "verified",
        source_batch_id: b,
      });
      expect((await c.query("select count(*)::int as n from public.schools where inep = '51000001'")).rows[0]?.n).toBe(1);
    });
  });

  it("dados idênticos a escola existente: duplicate (already_up_to_date), sem mudar updated_at", async () => {
    await withClaims("system", async (c) => {
      const b1 = await newBatch(c);
      await apply(c, b1, [row(1, "51000001", "Escola Um")]);
      await c.query("update public.schools set updated_at = now() - interval '1 day' where inep = '51000001'");
      const before = await c.query<{ updated_at: Date }>("select updated_at from public.schools where inep = '51000001'");
      const b2 = await newBatch(c);
      const t = await apply(c, b2, [row(1, "51000001", "Escola Um")]);
      expect(t).toEqual({ inserted: 0, updated: 0, duplicate: 1, rejected: 0 });
      expect((await actions(c, b2))[1]?.errors[0]?.code).toBe("already_up_to_date");
      const after = await c.query<{ updated_at: Date }>("select updated_at from public.schools where inep = '51000001'");
      expect(after.rows[0]?.updated_at).toEqual(before.rows[0]?.updated_at);
    });
  });

  it("nome normalizado + município já existente com INEP diferente: duplicate, não insere", async () => {
    await withClaims("system", async (c) => {
      await seedSchool(c, "51000001", "Escola Um");
      const b = await newBatch(c);
      const t = await apply(c, b, [row(1, "51000002", "Escola Um")]);
      expect(t).toEqual({ inserted: 0, updated: 0, duplicate: 1, rejected: 0 });
      expect((await actions(c, b))[1]?.errors[0]?.code).toBe("duplicate_name_municipality");
      expect((await c.query("select 1 from public.schools where inep = '51000002'")).rowCount).toBe(0);
    });
  });

  it("mesmo nome em municípios diferentes não é duplicidade", async () => {
    await withClaims("system", async (c) => {
      await c.query(
        "insert into public.municipalities (ibge_code, uf, name, is_enabled) values ('5100102', 'MT', 'Acorizal', true)",
      );
      await seedSchool(c, "51000001", "Escola Um");
      const b = await newBatch(c);
      const t = await apply(c, b, [row(1, "51000002", "Escola Um", { ibge_code: "5100102" })]);
      expect(t.inserted).toBe(1);
    });
  });

  it("INEP repetido no mesmo arquivo: primeira insere, segunda é duplicate", async () => {
    await withClaims("system", async (c) => {
      const b = await newBatch(c);
      const t = await apply(c, b, [row(1, "51000001", "Escola Um"), row(2, "51000001", "Escola Um Bis")]);
      expect(t).toEqual({ inserted: 1, updated: 0, duplicate: 1, rejected: 0 });
      const a = await actions(c, b);
      expect(a[2]?.action).toBe("duplicate");
      expect(a[2]?.errors[0]?.code).toBe("duplicate_inep_in_file");
      expect((await c.query("select name from public.schools where inep = '51000001'")).rows[0]?.name).toBe("Escola Um");
    });
  });

  it("INEP repetido em chamadas diferentes do mesmo lote também é duplicate", async () => {
    await withClaims("system", async (c) => {
      const b = await newBatch(c);
      await apply(c, b, [row(1, "51000001", "Escola Um")]);
      const t = await apply(c, b, [row(501, "51000001", "Escola Um Bis")]);
      expect(t.duplicate).toBe(1);
    });
  });

  it("município desabilitado ou inexistente: rejected municipality_not_enabled, sem escola", async () => {
    await withClaims("system", async (c) => {
      const b = await newBatch(c);
      const t = await apply(c, b, [
        row(1, "52000001", "Escola Goiânia", { ibge_code: DISABLED_IBGE }),
        row(2, "99000001", "Escola Fantasma", { ibge_code: "9999999" }),
      ]);
      expect(t).toEqual({ inserted: 0, updated: 0, duplicate: 0, rejected: 2 });
      const a = await actions(c, b);
      expect(a[1]?.errors[0]?.code).toBe("municipality_not_enabled");
      expect(a[2]?.errors[0]?.code).toBe("municipality_not_enabled");
      expect((await c.query("select 1 from public.schools where inep in ('52000001','99000001')")).rowCount).toBe(0);
    });
  });

  it("defesa em profundidade: INEP inválido, nome vazio, rede inválida e erros da linha viram rejected", async () => {
    await withClaims("system", async (c) => {
      const b = await newBatch(c);
      const t = await apply(c, b, [
        row(1, "123", "Escola INEP Curto"),
        row(2, null, "Escola Sem INEP"),
        row(3, "51000003", "   "),
        row(4, "51000004", "Escola Rede Ruim", { network: "xyz" }),
        row(5, "51000005", "Escola Erro Zod", { errors: [{ code: "invalid_cep", message: "CEP inválido" }] }),
      ]);
      expect(t).toEqual({ inserted: 0, updated: 0, duplicate: 0, rejected: 5 });
      const a = await actions(c, b);
      expect(a[1]?.errors[0]?.code).toBe("invalid_inep");
      expect(a[3]?.errors[0]?.code).toBe("invalid_name");
      expect(a[4]?.errors[0]?.code).toBe("invalid_network");
      expect(a[5]?.errors[0]?.code).toBe("invalid_cep");
      expect((await c.query("select count(*)::int as n from public.schools")).rows[0]?.n).toBe(0);
    });
  });

  it("guarda raw (quando enviado) e normalized em import_rows", async () => {
    await withClaims("system", async (c) => {
      const b = await newBatch(c);
      await apply(c, b, [row(1, "51000001", "Escola Um", { raw: { CO_ENTIDADE: "51000001" } })]);
      const r = await c.query("select raw, normalized from public.import_rows where batch_id = $1", [b]);
      expect(r.rows[0]?.raw).toEqual({ CO_ENTIDADE: "51000001" });
      expect(r.rows[0]?.normalized).toMatchObject({ inep: "51000001", name: "Escola Um" });
      expect(r.rows[0]?.normalized).not.toHaveProperty("raw");
    });
  });

  it("idempotente por (batch_id, row_number): reaplicar devolve o mesmo resultado e não duplica", async () => {
    await withClaims("system", async (c) => {
      await seedSchool(c, "51000009", "Escola Nove");
      const b = await newBatch(c);
      const rows = [
        row(1, "51000001", "Escola Um"),
        row(2, "51000009", "Escola Nove Nova"),
        row(3, "51000001", "Escola Um Bis"),
        row(4, "1", "Ruim"),
      ];
      const first = await apply(c, b, rows);
      expect(first).toEqual({ inserted: 1, updated: 1, duplicate: 1, rejected: 1 });
      const again = await apply(c, b, rows);
      expect(again).toEqual(first);
      expect((await c.query("select count(*)::int as n from public.import_rows where batch_id = $1", [b])).rows[0]?.n).toBe(4);
      const bt = await c.query("select inserted_count, updated_count, duplicate_count, rejected_count, total_rows from public.import_batches where id = $1", [b]);
      expect(bt.rows[0]).toEqual({ inserted_count: 1, updated_count: 1, duplicate_count: 1, rejected_count: 1, total_rows: 4 });
    });
  });

  it("contadores do lote acumulam entre chamadas (fatias)", async () => {
    await withClaims("system", async (c) => {
      const b = await newBatch(c);
      await apply(c, b, [row(1, "51000001", "Escola Um"), row(2, "51000002", "Escola Dois")]);
      await apply(c, b, [row(3, "51000003", "Escola Três"), row(4, "x", "Ruim")]);
      const bt = await c.query("select inserted_count, rejected_count, total_rows from public.import_batches where id = $1", [b]);
      expect(bt.rows[0]).toEqual({ inserted_count: 3, rejected_count: 1, total_rows: 4 });
    });
  });

  it("lote inexistente falha", async () => {
    await withClaims("system", async (c) => {
      const r = await attempt(c, "select public.import_apply_rows($1, '[]'::jsonb)", [randomUUID()]);
      expect(r.error).toMatch(/lote/i);
    });
  });

  it("escola criada pela importação é auditada (sem email/phone)", async () => {
    await withClaims("system", async (c) => {
      const b = await newBatch(c);
      await apply(c, b, [row(1, "51000001", "Escola Um")]);
      const r = await c.query<{ after: Record<string, unknown>; actor_role: string }>(
        "select after, actor_role from public.audit_log where entity_table = 'schools' and after ->> 'inep' = '51000001'",
      );
      expect(r.rows).toHaveLength(1);
      expect(r.rows[0]?.after).not.toHaveProperty("email");
      expect(r.rows[0]?.after).not.toHaveProperty("phone");
      expect(r.rows[0]?.actor_role).toBe("system");
    });
  });

  it("EXECUTE só para service_role", async () => {
    const sigs = [
      "public.import_apply_rows(uuid, jsonb)",
      "public.import_claim_batch(text, text, uuid, boolean)",
    ];
    await withSuperuser(async (c) => {
      for (const sig of sigs) {
        for (const [role, expected] of [["anon", false], ["authenticated", false], ["service_role", true]] as const) {
          const r = await c.query<{ ok: boolean }>("select has_function_privilege($1, $2, 'EXECUTE') as ok", [role, sig]);
          expect(r.rows[0]?.ok, `${role} ${sig}`).toBe(expected);
        }
        const p = await c.query<{ ok: boolean }>("select has_function_privilege('public', $1, 'EXECUTE') as ok", [sig]);
        expect(p.rows[0]?.ok).toBe(false);
      }
    });
    for (const who of ["anon", "parent", "admin"] as const) {
      await withClaims(who, async (c) => {
        const a = await attempt(c, "select public.import_apply_rows($1, '[]'::jsonb)", [randomUUID()]);
        expect(a.code, who).toBe("42501");
        const k = await attempt(c, "select * from public.import_claim_batch('h', 'f.csv', null, false)");
        expect(k.code, who).toBe("42501");
      });
    }
  });

  it("função é SECURITY DEFINER com search_path vazio", async () => {
    await withSuperuser(async (c) => {
      const r = await c.query<{ proname: string; prosecdef: boolean; proconfig: string[] | null }>(
        `select proname, prosecdef, proconfig from pg_proc
         where pronamespace = 'public'::regnamespace and proname in ('import_apply_rows', 'import_claim_batch')`,
      );
      expect(r.rows).toHaveLength(2);
      for (const p of r.rows) {
        expect(p.prosecdef, p.proname).toBe(true);
        expect(p.proconfig, p.proname).toContain('search_path=""');
      }
    });
  });

  it("import_claim_batch: cria lote pendente e devolve o existente na segunda chamada", async () => {
    await withClaims("system", async (c) => {
      const hash = randomUUID();
      const a = await c.query("select * from public.import_claim_batch($1, 'a.csv', $2, true)", [hash, null]);
      expect(a.rows[0]).toMatchObject({ already_exists: false, status: "pending" });
      const b = await c.query("select * from public.import_claim_batch($1, 'outro.csv', $2, false)", [hash, null]);
      expect(b.rows[0]).toMatchObject({ already_exists: true, batch_id: a.rows[0]?.batch_id, status: "pending" });
      const row1 = await c.query("select file_name, is_demo, status from public.import_batches where id = $1", [
        a.rows[0]?.batch_id,
      ]);
      expect(row1.rows[0]).toEqual({ file_name: "a.csv", is_demo: true, status: "pending" });
    });
  });

  it("import_claim_batch: duas chamadas concorrentes com o mesmo hash geram um só lote", async () => {
    const hash = randomUUID();
    const call = () =>
      withSuperuser(async (c) => {
        await c.query("set role service_role");
        const r = await c.query<{ batch_id: string; already_exists: boolean }>(
          "select * from public.import_claim_batch($1, 'c.csv', null, false)",
          [hash],
        );
        return r.rows[0];
      });
    try {
      const results = await Promise.all([call(), call(), call(), call()]);
      expect(new Set(results.map((r) => r?.batch_id)).size).toBe(1);
      expect(results.filter((r) => r && !r.already_exists)).toHaveLength(1);
      const n = await withSuperuser((c) =>
        c.query("select count(*)::int as n from public.import_batches where file_hash = $1", [hash]),
      );
      expect(n.rows[0]?.n).toBe(1);
    } finally {
      await withSuperuser((c) => c.query("delete from public.import_batches where file_hash = $1", [hash]));
    }
  });
});
