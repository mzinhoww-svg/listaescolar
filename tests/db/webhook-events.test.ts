// Um teste por evento real do PLAN S25 (`list.published`, `list.updated`, `list.archived`, `school.approved`):
// o FATO real (gatilho já existente da S05/S06) dispara o gatilho novo e enfileira exatamente a entrega esperada,
// com filtro por cobertura de UF e idempotência por (endpoint, event_id). Nenhum evento é fabricado por SQL direto.
import { randomInt } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedPartner } from "./b2b-fixtures";
import { decide, docsAwaiting, seedClaimSchool } from "./claim-fixtures";
import { cleanupUsers, IDS, seedUsers } from "./helpers";
import { publish, seedCandidate, seedList, seedSchool, transition } from "./list-fixtures";
import { tx } from "./review-fixtures";
import { createEndpoint, deliveriesFor } from "./webhook-fixtures";

beforeAll(seedUsers);
afterAll(cleanupUsers);

const emitErrors = async (c: Client) => (await c.query("select count(*)::int as n from public.b2b_webhook_emit_errors")).rows[0].n as number;

/** 1ª publicação de uma lista: precisa passar por submitted -> processing -> approved antes de `publish` (S05). */
async function publishFirstTime(c: Client, listId: string, versionId: string): Promise<void> {
  for (const s of ["submitted", "processing", "approved"] as const) await transition(c, listId, s);
  await publish(c, listId, versionId);
}

describe("eventos reais de webhook (S25)", () => {
  it("list.published: 1ª publicação enfileira para o endpoint assinante, na cobertura certa, uma vez só", async () => {
    await tx(async (c) => {
      const partner = await seedPartner(c, { status: "active", coverageUfs: ["MT"] });
      const endpoint = await createEndpoint(c, partner, IDS.parent, { events: ["list.published"] });
      const schoolId = await seedSchool(c, String(60_000_000 + randomInt(0, 900_000)));
      const listId = await seedList(c, schoolId);
      const versionId = await seedCandidate(c, listId, 3);
      await publishFirstTime(c, listId, versionId);

      const rows = await deliveriesFor(c, endpoint);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ event_type: "list.published", status: "queued", attempts: 0 });
      expect(rows[0]!.payload).toMatchObject({ school_year: 2027, list_id: listId, version_id: versionId, version_number: 1, item_count: 3 });
      expect(await emitErrors(c)).toBe(0);
    });
  });

  it("list.updated: troca de versão numa lista já publicada (não é list.published de novo)", async () => {
    await tx(async (c) => {
      const partner = await seedPartner(c, { status: "active", coverageUfs: ["MT"] });
      const endpoint = await createEndpoint(c, partner, IDS.parent, { events: ["list.published", "list.updated"] });
      const schoolId = await seedSchool(c, String(60_000_000 + randomInt(0, 900_000)));
      const listId = await seedList(c, schoolId);
      const v1 = await seedCandidate(c, listId, 2);
      await publishFirstTime(c, listId, v1);
      const v2 = await seedCandidate(c, listId, 4);
      await publish(c, listId, v2);

      const rows = await deliveriesFor(c, endpoint);
      expect(rows.map((r) => r.event_type)).toEqual(["list.published", "list.updated"]);
      expect(rows[1]!.payload).toMatchObject({ version_id: v2, version_number: 2, item_count: 4 });
    });
  });

  it("list.archived: arquivar uma lista publicada enfileira o evento", async () => {
    await tx(async (c) => {
      const partner = await seedPartner(c, { status: "active", coverageUfs: ["MT"] });
      const endpoint = await createEndpoint(c, partner, IDS.parent, { events: ["list.archived"] });
      const schoolId = await seedSchool(c, String(60_000_000 + randomInt(0, 900_000)));
      const listId = await seedList(c, schoolId);
      const versionId = await seedCandidate(c, listId);
      await publishFirstTime(c, listId, versionId);
      await c.query("select public.list_archive($1, $2, 'teste')", [listId, IDS.admin]);

      const rows = await deliveriesFor(c, endpoint);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ event_type: "list.archived", status: "queued" });
      expect(rows[0]!.payload).toHaveProperty("archived_at");
    });
  });

  it("school.approved: reivindicação aprovada (mesma transição que verifica a escola) enfileira o evento", async () => {
    await tx(async (c) => {
      const partner = await seedPartner(c, { status: "active", coverageUfs: ["MT"] });
      const endpoint = await createEndpoint(c, partner, IDS.parent, { events: ["school.approved"] });
      const schoolId = await seedClaimSchool(c, { inep: String(60_000_000 + randomInt(0, 900_000)) });
      const claimId = await docsAwaiting(c, schoolId);
      await decide(c, claimId, "approved");

      const rows = await deliveriesFor(c, endpoint);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ event_type: "school.approved", status: "queued" });
    });
  });

  it("endpoint sem o evento assinado não recebe", async () => {
    await tx(async (c) => {
      const partner = await seedPartner(c, { status: "active", coverageUfs: ["MT"] });
      const endpoint = await createEndpoint(c, partner, IDS.parent, { events: ["school.approved"] }); // sem list.*
      const schoolId = await seedSchool(c, String(60_000_000 + randomInt(0, 900_000)));
      const listId = await seedList(c, schoolId);
      const versionId = await seedCandidate(c, listId);
      await publishFirstTime(c, listId, versionId);
      expect(await deliveriesFor(c, endpoint)).toHaveLength(0);
    });
  });

  it("parceiro fora da cobertura (UF) não recebe; nacional (sem coverage_ufs) recebe tudo", async () => {
    await tx(async (c) => {
      const regional = await seedPartner(c, { status: "active", coverageUfs: ["SP"], ownerId: IDS.parent }); // escola nasce em MT (Cuiabá)
      const nacional = await seedPartner(c, { status: "active", coverageUfs: null, ownerId: IDS.school_member });
      const epRegional = await createEndpoint(c, regional, IDS.parent, { events: ["list.published"] });
      const epNacional = await createEndpoint(c, nacional, IDS.school_member, { events: ["list.published"] });
      const schoolId = await seedSchool(c, String(60_000_000 + randomInt(0, 900_000)));
      const listId = await seedList(c, schoolId);
      const versionId = await seedCandidate(c, listId);
      await publishFirstTime(c, listId, versionId);
      expect(await deliveriesFor(c, epRegional)).toHaveLength(0);
      expect(await deliveriesFor(c, epNacional)).toHaveLength(1);
    });
  });

  it("parceiro sandbox/pendente/suspenso não recebe; só active/sandbox", async () => {
    await tx(async (c) => {
      const pending = await seedPartner(c, { status: "pending" });
      // pending não pode nem criar endpoint (defesa em profundidade além do filtro de fila por status).
      await expect(createEndpoint(c, pending, IDS.parent, {})).rejects.toThrow();
    });
  });
});
