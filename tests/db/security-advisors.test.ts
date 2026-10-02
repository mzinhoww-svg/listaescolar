// D-093/D-094/D-096 (S19, migration 0607). Ver Ruling no ledger: sem mudança de schema para D-093/D-096
// (grants intencionais, verificados aqui como guarda de regressão); D-094 é NO-OP local (pg_net não existe
// neste banco — só age quando aplicada num banco que já o tem, ver comentário da própria migration).
import { describe, expect, it } from "vitest";
import { inTx } from "./helpers";

describe("D-093/D-096: grants intencionais continuam intactos após a 0607", () => {
  it("auth_role() e stationery_is_active(uuid) continuam executáveis por anon e authenticated", async () => {
    await inTx(async (c) => {
      for (const sig of ["public.auth_role()", "public.stationery_is_active(uuid)"]) {
        for (const role of ["anon", "authenticated"]) {
          const r = await c.query("select has_function_privilege($1, $2, 'execute') as ok", [role, sig]);
          expect(r.rows[0].ok, `${sig} para ${role}`).toBe(true);
        }
      }
    });
  });

  it("nenhum dos dois é executável por public (só pelos papéis explícitos)", async () => {
    await inTx(async (c) => {
      for (const sig of ["public.auth_role()", "public.stationery_is_active(uuid)"]) {
        const r = await c.query("select has_function_privilege('public', $1, 'execute') as ok", [sig]);
        expect(r.rows[0].ok, sig).toBe(false);
      }
    });
  });
});

describe("D-094: pg_net não existe no schema public deste banco local (bloco da 0607 é NO-OP aqui)", () => {
  it("sem a extensão pg_net (foi instalada manualmente só no staging)", async () => {
    await inTx(async (c) => {
      const r = await c.query("select 1 from pg_extension where extname = 'pg_net'");
      expect(r.rowCount).toBe(0);
    });
  });
});
