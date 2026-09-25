import { describe, expect, it } from "vitest";
import { withSuperuser } from "./helpers";

const ENUMS: Record<string, string[]> = {
  user_role: ["parent", "school_member", "admin", "stationery_member", "system"],
  registry_source: ["inep_import", "admin_manual", "school_claim"],
  verification_status: ["registered", "claimed", "verified", "suspended"],
  claim_status: [
    "submitted",
    "awaiting_verification",
    "token_expired",
    "insufficient_evidence",
    "rejected",
    "approved",
  ],
  claim_method: ["institutional_email", "institutional_whatsapp", "documents"],
  list_status: [
    "draft",
    "submitted",
    "processing",
    "processing_async",
    "review_needed",
    "human_review",
    "approved",
    "published",
    "archived",
    "rejected",
  ],
  stationery_status: [
    "signup",
    "accreditation",
    "under_review",
    "approved",
    "active",
    "paused",
    "suspended",
    "rejected",
  ],
  lead_status: [
    "received",
    "viewed",
    "in_progress",
    "quote_sent",
    "awaiting_customer",
    "converted",
    "declined",
    "expired",
    "cancelled",
  ],
  job_status: ["queued", "running", "succeeded", "failed", "retrying", "dead"],
};

describe("schema base", () => {
  for (const [name, values] of Object.entries(ENUMS)) {
    it(`enum ${name} tem os valores exatos, em ordem`, async () => {
      const labels = await withSuperuser(async (c) => {
        const r = await c.query<{ enumlabel: string }>(
          `select e.enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid
           join pg_namespace n on n.oid = t.typnamespace
           where n.nspname = 'public' and t.typname = $1 order by e.enumsortorder`,
          [name],
        );
        return r.rows.map((x) => x.enumlabel);
      });
      expect(labels).toEqual(values);
    });
  }

  it("existem as tabelas municipalities, profiles e audit_log", async () => {
    const names = await withSuperuser(async (c) => {
      const r = await c.query<{ table_name: string }>(
        "select table_name from information_schema.tables where table_schema = 'public'",
      );
      return r.rows.map((x) => x.table_name);
    });
    expect(names).toEqual(expect.arrayContaining(["municipalities", "profiles", "audit_log"]));
  });

  it("toda tabela do schema public tem RLS habilitada", async () => {
    const rows = await withSuperuser(async (c) => {
      const r = await c.query<{ relname: string; relrowsecurity: boolean }>(
        `select c.relname, c.relrowsecurity from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind in ('r', 'p')`,
      );
      return r.rows;
    });
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(rows.filter((x) => !x.relrowsecurity)).toEqual([]);
  });

  it("toda tabela tem created_at e updated_at", async () => {
    const missing = await withSuperuser(async (c) => {
      const r = await c.query<{ table_name: string }>(
        `select t.table_name from information_schema.tables t
         where t.table_schema = 'public' and t.table_type = 'BASE TABLE'
           and (select count(*) from information_schema.columns k
                where k.table_schema = 'public' and k.table_name = t.table_name
                  and k.column_name in ('created_at', 'updated_at')) < 2`,
      );
      return r.rows.map((x) => x.table_name);
    });
    expect(missing).toEqual([]);
  });

  it("municipalities tem Cuiabá (5103403, MT) habilitado e nenhum outro habilitado", async () => {
    const rows = await withSuperuser(async (c) => {
      const r = await c.query<{ ibge_code: string; uf: string; name: string }>(
        "select ibge_code, uf, name from public.municipalities where is_enabled",
      );
      return r.rows;
    });
    expect(rows).toEqual([{ ibge_code: "5103403", uf: "MT", name: "Cuiabá" }]);
  });

  it("set_updated_at atualiza updated_at em UPDATE", async () => {
    const changed = await withSuperuser(async (c) => {
      await c.query("begin");
      try {
        await c.query(
          "update public.municipalities set updated_at = now() - interval '1 day' where ibge_code = '5103403'",
        );
        const r = await c.query<{ ok: boolean }>(
          `update public.municipalities set name = name where ibge_code = '5103403'
           returning updated_at > now() - interval '1 hour' as ok`,
        );
        return r.rows[0]?.ok;
      } finally {
        await c.query("rollback");
      }
    });
    expect(changed).toBe(true);
  });
});
