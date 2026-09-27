import { randomBytes } from "node:crypto";
import type { Client } from "pg";

import { callAsService } from "./b2b-fixtures";

// Fixtures da S25 (widget e webhooks). O segredo cifrado é opaco para o banco: nos testes de banco usamos bytes
// aleatórios (nunca uma cifra real — isso é responsabilidade de `features/webhooks/crypto.ts`, testado à parte).

export type FakeSecret = { ciphertext: Buffer; iv: Buffer; tag: Buffer };
export function fakeSecret(): FakeSecret {
  return { ciphertext: randomBytes(48), iv: randomBytes(12), tag: randomBytes(16) };
}

export type SeedEndpointOpts = {
  url?: string;
  events?: readonly string[];
  actorId?: string;
  secret?: FakeSecret;
};

export async function createEndpoint(c: Client, partnerId: string, actorId: string, opts: SeedEndpointOpts = {}): Promise<string> {
  const s = opts.secret ?? fakeSecret();
  const rows = await callAsService<{ id: string }>(
    c,
    "select public.b2b_webhook_endpoint_create($1, $2, $3, $4::text[], $5::bytea, $6::bytea, $7::bytea, 1) as id",
    [opts.actorId ?? actorId, partnerId, opts.url ?? "https://parceiro-teste.invalid/webhooks/listacerta", opts.events ?? ["list.published", "list.updated", "list.archived", "school.approved"], s.ciphertext, s.iv, s.tag],
  );
  return rows[0]!.id;
}

export async function deliveriesFor(c: Client, endpointId: string): Promise<Array<{ id: string; event_type: string; event_id: string; status: string; attempts: number; payload: Record<string, unknown> }>> {
  const r = await c.query(
    "select id, event_type::text, event_id, status::text, attempts, payload from public.b2b_webhook_deliveries where endpoint_id = $1 order by created_at, id",
    [endpointId],
  );
  return r.rows;
}
