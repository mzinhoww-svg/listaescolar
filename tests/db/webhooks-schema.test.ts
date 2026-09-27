// Schema, RLS/grants, funções de configuração e despacho (lease, retry exponencial com teto, dead letter,
// reenvio) do widget e dos webhooks (S25). Eventos reais ficam em `webhook-events.test.ts`.
import { randomBytes, randomInt } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { callAsService, seedPartner } from "./b2b-fixtures";
import { attempt, attemptH, cleanupUsers, IDS, seedUsers } from "./helpers";
import { backToSuper, publish, seedCandidate, seedList, seedSchool, switchTo, transition } from "./list-fixtures";
import { tx } from "./review-fixtures";
import { createEndpoint, deliveriesFor, fakeSecret } from "./webhook-fixtures";

beforeAll(seedUsers);
afterAll(cleanupUsers);

/** Lista REAL (não-demo) publicada: os testes de despacho usam parceiro `active`, que só recebe evento de dado
 * REAL (revisão de segurança, Bloqueante 1) — `seedList` marca `is_demo = true` por padrão (usado por outras
 * fatias), então este helper desliga a flag depois de semear. */
async function newPublishedList(c: Client): Promise<{ listId: string; versionId: string }> {
  const schoolId = await seedSchool(c, String(70_000_000 + randomInt(0, 900_000)));
  const listId = await seedList(c, schoolId);
  // `service_role` não tem UPDATE em `school_lists` (só as funções SECURITY DEFINER escrevem lá) — alguns testes
  // chamam este helper já com `set local role service_role` ativo; sai e volta para o papel atual.
  const prevRole = (await c.query("select current_user as u")).rows[0].u as string;
  await c.query("reset role");
  await c.query("update public.school_lists set is_demo = false where id = $1", [listId]);
  await c.query(`set local role ${prevRole}`).catch(() => undefined);
  const versionId = await seedCandidate(c, listId);
  for (const s of ["submitted", "processing", "approved"] as const) await transition(c, listId, s);
  await publish(c, listId, versionId);
  return { listId, versionId };
}

describe("widget: configuração e leitura pública", () => {
  it("dono salva; leitura pública só quando enabled e parceiro active/sandbox", async () => {
    await tx(async (c) => {
      const partner = await seedPartner(c, { status: "active" });
      await callAsService(c, "select public.b2b_widget_config_save($1,$2,$3,$4,$5)", [IDS.parent, partner, "#0B6B4A", "loja-parceira.example.com", true]);
      const pub = await callAsService<{ b2b_widget_config_public: Record<string, unknown> | null }>(c, "select public.b2b_widget_config_public($1)", [partner]);
      expect(pub[0]!.b2b_widget_config_public).toMatchObject({ cartTargetDomain: "loja-parceira.example.com", accentColor: "#0B6B4A" });

      await callAsService(c, "select public.b2b_widget_config_save($1,$2,$3,$4,$5)", [IDS.parent, partner, "#0B6B4A", "loja-parceira.example.com", false]);
      const off = await callAsService<{ b2b_widget_config_public: unknown }>(c, "select public.b2b_widget_config_public($1)", [partner]);
      expect(off[0]!.b2b_widget_config_public).toBeNull();
    });
  });

  it("domínio com esquema/caminho/porta é recusado (anti open-redirect na origem)", async () => {
    await tx(async (c) => {
      const partner = await seedPartner(c, { status: "active" });
      await c.query("set local role service_role");
      for (const bad of ["https://loja.example.com", "loja.example.com/carrinho", "loja.example.com:8080", "javascript:alert(1)"]) {
        const r = await attempt(c, "select public.b2b_widget_config_save($1,$2,$3,$4,$5)", [IDS.parent, partner, "#000000", bad, true]);
        expect(r.error, `domínio deveria ser recusado: ${bad}`).not.toBeNull();
      }
    });
  });

  it("quem não é dono nem admin não configura", async () => {
    await tx(async (c) => {
      const partner = await seedPartner(c, { status: "active", ownerId: IDS.parent });
      await c.query("set local role service_role");
      const r = await attemptH(c, "select public.b2b_widget_config_save($1,$2,$3,$4,$5)", [IDS.school_member, partner, "#000000", "loja.example.com", true]);
      expect(r.hint).toBe("forbidden");
    });
  });
});

describe("webhooks: endpoints, segredo e RLS", () => {
  it("cria, atualiza eventos/URL e respeita o limite de 3 endpoints por parceiro", async () => {
    await tx(async (c) => {
      const partner = await seedPartner(c, { status: "active" });
      await createEndpoint(c, partner, IDS.parent, { url: "https://a.example.com/hook" });
      await createEndpoint(c, partner, IDS.parent, { url: "https://b.example.com/hook" });
      const third = await createEndpoint(c, partner, IDS.parent, { url: "https://c.example.com/hook" });
      await c.query("set local role service_role");
      const blocked = await attemptH(c, "select public.b2b_webhook_endpoint_create($1,$2,$3,$4::text[],$5::bytea,$6::bytea,$7::bytea,1)", [
        IDS.parent, partner, "https://d.example.com/hook", ["list.published"], randomBytes(16), randomBytes(12), randomBytes(16),
      ]);
      expect(blocked.hint).toBe("too_many_endpoints");

      await callAsService(c, "select public.b2b_webhook_endpoint_update($1,$2,$3,$4::text[])", [IDS.parent, third, "https://c2.example.com/hook", ["school.approved"]]);
      const row = (await c.query("select url, events::text[] as events from public.b2b_webhook_endpoints where id = $1", [third])).rows[0];
      expect(row.url).toBe("https://c2.example.com/hook");
      expect(row.events).toEqual(["school.approved"]);
    });
  });

  it("URL só https (loopback http só é aceito pelo banco; a restrição por APP_ENV é do servidor)", async () => {
    await tx(async (c) => {
      const partner = await seedPartner(c, { status: "active" });
      await c.query("set local role service_role");
      const bad = await attempt(c, "select public.b2b_webhook_endpoint_create($1,$2,$3,$4::text[],$5::bytea,$6::bytea,$7::bytea,1)", [
        IDS.parent, partner, "http://malicioso.example.com/hook", ["list.published"], randomBytes(16), randomBytes(12), randomBytes(16),
      ]);
      expect(bad.error).not.toBeNull();
      const ok = await attempt(c, "select public.b2b_webhook_endpoint_create($1,$2,$3,$4::text[],$5::bytea,$6::bytea,$7::bytea,1)", [
        IDS.parent, partner, "http://127.0.0.1:4000/hook", ["list.published"], randomBytes(16), randomBytes(12), randomBytes(16),
      ]);
      expect(ok.error).toBeNull();
    });
  });

  it("rotacionar e revelar o segredo: só dono/admin, valor cifrado nunca aparece na leitura do dono", async () => {
    await tx(async (c) => {
      const partner = await seedPartner(c, { status: "active", ownerId: IDS.parent });
      const secret1 = fakeSecret();
      const endpoint = await createEndpoint(c, partner, IDS.parent, { secret: secret1 });

      const secret2 = fakeSecret();
      await callAsService(c, "select public.b2b_webhook_secret_rotate($1,$2,$3::bytea,$4::bytea,$5::bytea,2)", [IDS.parent, endpoint, secret2.ciphertext, secret2.iv, secret2.tag]);
      const revealed = await callAsService<{ secret_ciphertext: Buffer; secret_key_version: number }>(c, "select * from public.b2b_webhook_secret_reveal($1,$2)", [IDS.parent, endpoint]);
      expect(revealed[0]!.secret_ciphertext.equals(secret2.ciphertext)).toBe(true);
      expect(revealed[0]!.secret_key_version).toBe(2);

      const forbidden = await attemptH(c, "select * from public.b2b_webhook_secret_reveal($1,$2)", [IDS.school_member, endpoint]);
      expect(forbidden.hint).toBe("forbidden");

      // RLS: o dono lê metadados do endpoint, mas a coluna do segredo não está no grant de `authenticated`.
      await switchTo(c, "parent");
      const own = await attempt(c, "select id, url, events from public.b2b_webhook_endpoints where id = $1", [endpoint]);
      expect(own.rowCount).toBe(1);
      const secretCol = await attempt(c, "select secret_ciphertext from public.b2b_webhook_endpoints where id = $1", [endpoint]);
      expect(secretCol.error).not.toBeNull();
      await backToSuper(c);
    });
  });

  it("RLS: outro dono não vê o endpoint/config/entregas alheias; admin vê tudo", async () => {
    await tx(async (c) => {
      const mine = await seedPartner(c, { status: "active", ownerId: IDS.parent });
      const other = await seedPartner(c, { status: "active", ownerId: IDS.school_member });
      await createEndpoint(c, mine, IDS.parent);
      const endpointOther = await createEndpoint(c, other, IDS.school_member);

      await switchTo(c, "parent");
      const sawOther = await attempt(c, "select id from public.b2b_webhook_endpoints where id = $1", [endpointOther]);
      expect(sawOther.rowCount).toBe(0);
      await backToSuper(c);

      await switchTo(c, "admin");
      const admin = await attempt(c, "select id from public.b2b_webhook_endpoints where partner_id in ($1,$2)", [mine, other]);
      expect(admin.rowCount).toBe(2);
      await backToSuper(c);
    });
  });
});

type Claimed = { id: string; leaseId: string; attempts: number; eventType: string; eventId: string; url: string; secret: unknown };

/** `setof jsonb`: cada linha vem como uma coluna jsonb nomeada como a função. */
async function claim(c: Client, limit = 10): Promise<Claimed[]> {
  const r = await c.query<{ b2b_webhook_claim_deliveries: Claimed }>("select public.b2b_webhook_claim_deliveries($1)", [limit]);
  return r.rows.map((row) => row.b2b_webhook_claim_deliveries);
}

describe("despacho: lease, retry exponencial com teto e dead letter", () => {
  it("reivindica com lease, marca sent e grava a tentativa no log", async () => {
    await tx(async (c) => {
      const partner = await seedPartner(c, { status: "active" });
      const endpoint = await createEndpoint(c, partner, IDS.parent, { events: ["list.published"] });
      await newPublishedList(c);
      await c.query("set local role service_role");
      const rows = await claim(c, 10);
      const target = rows.find((r) => r.url.includes("parceiro-teste"));
      expect(target).toBeTruthy();
      const ok = await callAsService<{ b2b_webhook_mark_delivery: boolean }>(c, "select public.b2b_webhook_mark_delivery($1,$2,'sent',200,null,42)", [target!.id, target!.leaseId]);
      expect(ok[0]!.b2b_webhook_mark_delivery).toBe(true);
      const after = await deliveriesFor(c, endpoint);
      expect(after[0]).toMatchObject({ status: "sent" });
      const attemptsLog = await c.query("select outcome::text, http_status, attempt_number from public.b2b_webhook_delivery_attempts where delivery_id = $1", [target!.id]);
      expect(attemptsLog.rows).toEqual([{ outcome: "sent", http_status: 200, attempt_number: 1 }]);
    });
  });

  it("falha transitória agenda retry exponencial; falha permanente vai direto para dead", async () => {
    await tx(async (c) => {
      const partner = await seedPartner(c, { status: "active" });
      await createEndpoint(c, partner, IDS.parent, { events: ["list.published"] });
      await newPublishedList(c);
      await c.query("set local role service_role");

      const [claimed] = await claim(c, 1);
      expect(claimed!.attempts).toBe(1);
      const before = await c.query("select created_at from public.b2b_webhook_deliveries where id = $1", [claimed!.id]);

      await callAsService(c, "select public.b2b_webhook_mark_delivery($1,$2,'transient',503,'upstream_5xx',10)", [claimed!.id, claimed!.leaseId]);
      const row = (await c.query("select status::text, next_attempt_at, last_error_code from public.b2b_webhook_deliveries where id = $1", [claimed!.id])).rows[0];
      expect(row.status).toBe("failed");
      expect(row.last_error_code).toBe("upstream_5xx");
      expect(new Date(row.next_attempt_at).getTime()).toBeGreaterThan(new Date(before.rows[0].created_at).getTime());

      // segunda entrega (outro parceiro), falha permanente: dead na hora (sem esperar 24h/10 tentativas)
      const partner2 = await seedPartner(c, { status: "active", ownerId: IDS.school_member });
      await createEndpoint(c, partner2, IDS.school_member, { events: ["list.published"] });
      await newPublishedList(c);
      const [claimed2] = await claim(c, 1);
      await callAsService(c, "select public.b2b_webhook_mark_delivery($1,$2,'permanent',404,'not_found',5)", [claimed2!.id, claimed2!.leaseId]);
      const row2 = (await c.query("select status::text from public.b2b_webhook_deliveries where id = $1", [claimed2!.id])).rows[0];
      expect(row2.status).toBe("dead");
    });
  });

  it("vai para dead letter depois de 24h decorridas desde a criação, mesmo com falha transitória", async () => {
    await tx(async (c) => {
      const partner = await seedPartner(c, { status: "active" });
      await createEndpoint(c, partner, IDS.parent, { events: ["list.published"] });
      await newPublishedList(c);
      await c.query("update public.b2b_webhook_deliveries set created_at = now() - interval '25 hours'"); // superuser: contorna o grant (só a fixture "viaja no tempo")
      await c.query("set local role service_role");
      const [claimed] = await claim(c, 1);
      await callAsService(c, "select public.b2b_webhook_mark_delivery($1,$2,'transient',500,'upstream_5xx',10)", [claimed!.id, claimed!.leaseId]);
      const row = (await c.query("select status::text from public.b2b_webhook_deliveries where id = $1", [claimed!.id])).rows[0];
      expect(row.status).toBe("dead");
    });
  });

  it("só o dono da lease vigente marca o resultado; marcação com lease errada é ignorada", async () => {
    await tx(async (c) => {
      const partner = await seedPartner(c, { status: "active" });
      await createEndpoint(c, partner, IDS.parent, { events: ["list.published"] });
      await newPublishedList(c);
      await c.query("set local role service_role");
      const [claimed] = await claim(c, 1);
      const wrongLease = await callAsService<{ b2b_webhook_mark_delivery: boolean }>(c, "select public.b2b_webhook_mark_delivery($1, gen_random_uuid(), 'sent', 200, null, 1)", [claimed!.id]);
      expect(wrongLease[0]!.b2b_webhook_mark_delivery).toBe(false);
    });
  });

  it("reenvio manual cria uma nova entrega e preserva o histórico da original (dead)", async () => {
    await tx(async (c) => {
      const partner = await seedPartner(c, { status: "active", ownerId: IDS.parent });
      const endpoint = await createEndpoint(c, partner, IDS.parent, { events: ["list.published"] });
      await newPublishedList(c);
      await c.query("set local role service_role");
      const [claimed] = await claim(c, 1);
      await callAsService(c, "select public.b2b_webhook_mark_delivery($1,$2,'permanent',400,'bad_request',5)", [claimed!.id, claimed!.leaseId]);

      const resent = await callAsService<{ b2b_webhook_resend: string }>(c, "select public.b2b_webhook_resend($1,$2)", [IDS.parent, claimed!.id]);
      const newId = resent[0]!.b2b_webhook_resend;
      const rows = await deliveriesFor(c, endpoint);
      expect(rows).toHaveLength(2);
      expect(rows.find((r) => r.id === claimed!.id)).toMatchObject({ status: "dead" });
      expect(rows.find((r) => r.id === newId)).toMatchObject({ status: "queued", attempts: 0 });

      const notOwner = await attemptH(c, "select public.b2b_webhook_resend($1,$2)", [IDS.school_member, claimed!.id]);
      expect(notOwner.hint).toBe("forbidden");
    });
  });

  it("log de tentativas é append-only: UPDATE e DELETE são bloqueados mesmo pelo dono das linhas", async () => {
    await tx(async (c) => {
      const partner = await seedPartner(c, { status: "active" });
      await createEndpoint(c, partner, IDS.parent, { events: ["list.published"] });
      await newPublishedList(c);
      await c.query("set local role service_role");
      const [claimed] = await claim(c, 1);
      await callAsService(c, "select public.b2b_webhook_mark_delivery($1,$2,'sent',200,null,5)", [claimed!.id, claimed!.leaseId]);
      const attemptRow = (await c.query("select id from public.b2b_webhook_delivery_attempts where delivery_id = $1", [claimed!.id])).rows[0];
      const upd = await attempt(c, "update public.b2b_webhook_delivery_attempts set http_status = 500 where id = $1", [attemptRow.id]);
      expect(upd.error).not.toBeNull();
      const del = await attempt(c, "delete from public.b2b_webhook_delivery_attempts where id = $1", [attemptRow.id]);
      expect(del.error).not.toBeNull();
    });
  });

  // Revisão de segurança (Importante 2): o gatilho imutável de `b2b_webhook_delivery_attempts` bloqueava até a
  // exclusão em CASCATA (vinda de apagar a entrega/o endpoint/o parceiro), travando `b2b_webhook_purge_old` para
  // sempre depois de qualquer entrega ter uma tentativa registrada.
  it("purge_old apaga entrega antiga COM tentativa registrada, sem o gatilho imutável travar a cascata", async () => {
    await tx(async (c) => {
      const partner = await seedPartner(c, { status: "active" });
      await createEndpoint(c, partner, IDS.parent, { events: ["list.published"] });
      await newPublishedList(c);
      await c.query("set local role service_role");
      const [claimed] = await claim(c, 1);
      await callAsService(c, "select public.b2b_webhook_mark_delivery($1,$2,'sent',200,null,5)", [claimed!.id, claimed!.leaseId]);
      await c.query("reset role");
      // `set_updated_at` (gatilho BEFORE UPDATE) sobrescreveria qualquer tentativa de "viajar no tempo" por
      // UPDATE normal; desliga só para este UPDATE de teste (superuser) e liga de volta.
      await c.query("alter table public.b2b_webhook_deliveries disable trigger b2b_webhook_deliveries_set_updated_at");
      await c.query("update public.b2b_webhook_deliveries set updated_at = now() - interval '31 days' where id = $1", [claimed!.id]);
      await c.query("alter table public.b2b_webhook_deliveries enable trigger b2b_webhook_deliveries_set_updated_at");
      const purged = await callAsService<{ b2b_webhook_purge_old: number }>(c, "select public.b2b_webhook_purge_old(30)", []);
      expect(purged[0]!.b2b_webhook_purge_old).toBeGreaterThanOrEqual(1);
      const left = await c.query("select count(*)::int as n from public.b2b_webhook_deliveries where id = $1", [claimed!.id]);
      expect(left.rows[0].n).toBe(0);
      const attemptsLeft = await c.query("select count(*)::int as n from public.b2b_webhook_delivery_attempts where delivery_id = $1", [claimed!.id]);
      expect(attemptsLeft.rows[0].n).toBe(0);
    });
  });

  it("apagar um endpoint (ou o parceiro-dono) em cascata apaga entregas e tentativas, sem o gatilho imutável travar", async () => {
    await tx(async (c) => {
      const partner = await seedPartner(c, { status: "active" });
      const endpoint = await createEndpoint(c, partner, IDS.parent, { events: ["list.published"] });
      await newPublishedList(c);
      await c.query("set local role service_role");
      const [claimed] = await claim(c, 1);
      await callAsService(c, "select public.b2b_webhook_mark_delivery($1,$2,'sent',200,null,5)", [claimed!.id, claimed!.leaseId]);
      await c.query("reset role");
      const delEndpoint = await attempt(c, "delete from public.b2b_webhook_endpoints where id = $1", [endpoint]);
      expect(delEndpoint.error).toBeNull();
      const attemptsLeft = await c.query("select count(*)::int as n from public.b2b_webhook_delivery_attempts where delivery_id = $1", [claimed!.id]);
      expect(attemptsLeft.rows[0].n).toBe(0);

      // parceiro em cascata: novo endpoint/entrega/tentativa, agora apagando o PARCEIRO.
      const endpoint2 = await createEndpoint(c, partner, IDS.parent, { events: ["list.published"] });
      await newPublishedList(c);
      await c.query("set local role service_role");
      const [claimed2] = await claim(c, 1);
      await callAsService(c, "select public.b2b_webhook_mark_delivery($1,$2,'sent',200,null,5)", [claimed2!.id, claimed2!.leaseId]);
      await c.query("reset role");
      const delPartner = await attempt(c, "delete from public.b2b_partners where id = $1", [partner]);
      expect(delPartner.error).toBeNull();
      const endpointsLeft = await c.query("select count(*)::int as n from public.b2b_webhook_endpoints where id = $1", [endpoint2]);
      expect(endpointsLeft.rows[0].n).toBe(0);
    });
  });
});

describe("resend e claim respeitam o estado do endpoint/parceiro (revisão de segurança, Importante 3)", () => {
  it("reenvio exige parceiro active/sandbox e endpoint active", async () => {
    await tx(async (c) => {
      const partner = await seedPartner(c, { status: "active", ownerId: IDS.parent });
      const endpoint = await createEndpoint(c, partner, IDS.parent, { events: ["list.published"] });
      await newPublishedList(c);
      await c.query("set local role service_role");
      const [claimed] = await claim(c, 1);
      await callAsService(c, "select public.b2b_webhook_mark_delivery($1,$2,'permanent',400,'bad_request',5)", [claimed!.id, claimed!.leaseId]);
      await c.query("reset role");

      // endpoint desativado: reenvio recusado.
      await c.query("update public.b2b_webhook_endpoints set status = 'disabled' where id = $1", [endpoint]);
      const rDisabled = await attemptH(c, "select public.b2b_webhook_resend($1,$2)", [IDS.parent, claimed!.id]);
      expect(rDisabled.hint).toBe("invalid_state");
      await c.query("update public.b2b_webhook_endpoints set status = 'active' where id = $1", [endpoint]);

      // parceiro suspenso: reenvio recusado.
      await c.query("update public.b2b_partners set status = 'suspended', status_reason = 'teste' where id = $1", [partner]);
      const rSuspended = await attemptH(c, "select public.b2b_webhook_resend($1,$2)", [IDS.parent, claimed!.id]);
      expect(rSuspended.hint).toBe("invalid_state");
      await c.query("update public.b2b_partners set status = 'active', status_reason = null where id = $1", [partner]);

      const ok = await callAsService<{ b2b_webhook_resend: string }>(c, "select public.b2b_webhook_resend($1,$2)", [IDS.parent, claimed!.id]);
      expect(ok[0]!.b2b_webhook_resend).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  it("cota de reenvio: no máximo 5 por entrega original; recusa o 6º", async () => {
    await tx(async (c) => {
      const partner = await seedPartner(c, { status: "active", ownerId: IDS.parent });
      const endpoint = await createEndpoint(c, partner, IDS.parent, { events: ["list.published"] });
      await newPublishedList(c);
      await c.query("set local role service_role");
      const [claimed] = await claim(c, 1);
      await callAsService(c, "select public.b2b_webhook_mark_delivery($1,$2,'permanent',400,'bad_request',5)", [claimed!.id, claimed!.leaseId]);
      await c.query("reset role");
      // Simula 4 reenvios já existentes direto no banco (o 5º vem pela função de verdade) para não gastar tempo
      // de teste repetindo a função 5 vezes; o que importa é a CONTAGEM, não como cada linha nasceu.
      for (let i = 0; i < 4; i++) {
        await c.query(
          "insert into public.b2b_webhook_deliveries (endpoint_id, partner_id, event_type, event_id, payload, status) values ($1,$2,'list.published',$3,$4,'dead')",
          [endpoint, partner, `${claimed!.eventId}:resend:${i}`, JSON.stringify({})],
        );
      }
      const fifth = await callAsService<{ b2b_webhook_resend: string }>(c, "select public.b2b_webhook_resend($1,$2)", [IDS.parent, claimed!.id]);
      expect(fifth[0]!.b2b_webhook_resend).toMatch(/^[0-9a-f-]{36}$/);
      const sixth = await attemptH(c, "select public.b2b_webhook_resend($1,$2)", [IDS.parent, claimed!.id]);
      expect(sixth.hint).toBe("invalid_state");
    });
  });

  it("claim nunca reivindica entrega de endpoint desativado nem de parceiro suspenso (fica só na fila)", async () => {
    await tx(async (c) => {
      const partner = await seedPartner(c, { status: "active", ownerId: IDS.parent });
      const endpoint = await createEndpoint(c, partner, IDS.parent, { events: ["list.published"] });
      await newPublishedList(c);
      await c.query("update public.b2b_webhook_endpoints set status = 'disabled' where id = $1", [endpoint]);
      await c.query("set local role service_role");
      expect(await claim(c, 10)).toHaveLength(0);
      await c.query("reset role");
      await c.query("update public.b2b_webhook_endpoints set status = 'active' where id = $1", [endpoint]);
      await c.query("update public.b2b_partners set status = 'suspended', status_reason = 'teste' where id = $1", [partner]);
      await c.query("set local role service_role");
      expect(await claim(c, 10)).toHaveLength(0);
    });
  });
});
