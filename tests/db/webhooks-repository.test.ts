// Roda em `pnpm test:db` (Supabase local): exercita `features/webhooks/repository.ts` de verdade contra o
// PostgREST real (não só `pg` direto), porque a passagem de `bytea` (segredo cifrado) por RPC é um ponto real de
// risco de serialização que os testes de `tests/db/webhooks-schema.test.ts` (via `pg`) não cobrem.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({ userId: null as string | null, role: null as string | null }));
vi.mock("@/features/auth/queries", () => ({
  getCurrentUser: async () => (authState.userId ? { id: authState.userId } : null),
  getCurrentRole: async () => authState.role,
}));

import { getSessionActor, type SessionActor } from "@/features/auth/actor";
import { decryptSecret, encryptSecret } from "@/features/webhooks/crypto";
import { WebhookServiceError } from "@/features/webhooks/errors";
import { createEndpoint, listMyDeliveries, listMyEndpoints, resendDelivery, revealSecret, rotateSecret, updateEndpoint } from "@/features/webhooks/repository";

import { seedPartner } from "./b2b-fixtures";
import { IDS, seedUsers, withSuperuser } from "./helpers";

function localEnv(): { url: string; secret: string } {
  const out = execFileSync("node", ["scripts/supa.mjs", "env"], { encoding: "utf8" });
  const get = (name: string): string => {
    const m = new RegExp(`^${name}=(.+)$`, "m").exec(out);
    if (!m?.[1]) throw new Error(`variável ${name} ausente em supa.mjs env`);
    return m[1].trim();
  };
  const url = get("NEXT_PUBLIC_SUPABASE_URL");
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url)) throw new Error("só roda contra Supabase local");
  return { url, secret: get("SUPABASE_SECRET_KEY") };
}

let admin: SupabaseClient;
const partnerIds: string[] = [];
const ENCRYPTION_KEY = randomBytes(32).toString("hex");

async function actorOf(userId: string, role: SessionActor["role"] = "parent"): Promise<SessionActor> {
  authState.userId = userId;
  authState.role = role;
  const a = await getSessionActor();
  if (!a) throw new Error("sem ator");
  return a;
}

async function expectCode(p: Promise<unknown>, code: string): Promise<void> {
  const err = await p.then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(WebhookServiceError);
  expect((err as WebhookServiceError).code).toBe(code);
}

beforeAll(async () => {
  await seedUsers();
  const env = localEnv();
  admin = createClient(env.url, env.secret, { auth: { persistSession: false, autoRefreshToken: false } });
});

afterAll(async () => {
  await withSuperuser((c) =>
    c.query(`delete from public.b2b_partners where id = any($1::uuid[])`, [partnerIds]).catch(() => undefined),
  );
});

describe("features/webhooks/repository (PostgREST real, incl. bytea por RPC)", () => {
  it("cria endpoint (segredo cifrado por bytea), lista, atualiza, rotaciona e revela — round-trip do segredo", async () => {
    const partnerId = await withSuperuser((c) => seedPartner(c, { status: "active", ownerId: IDS.parent }));
    partnerIds.push(partnerId);
    const actor = await actorOf(IDS.parent, "parent");

    const secret1 = "whsec_" + randomBytes(32).toString("base64url");
    const enc1 = encryptSecret(secret1, ENCRYPTION_KEY);
    const { endpointId } = await createEndpoint(admin, actor, { url: "https://parceiro.example.com/hook", events: ["list.published", "school.approved"], ...enc1, keyVersion: 1 });
    expect(endpointId).toMatch(/^[0-9a-f-]{36}$/);

    const list = await listMyEndpoints(admin, actor);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: endpointId, url: "https://parceiro.example.com/hook", events: ["list.published", "school.approved"], status: "active" });

    await updateEndpoint(admin, actor, endpointId, { url: "https://parceiro.example.com/hook2", events: ["list.archived"] });
    const afterUpdate = await listMyEndpoints(admin, actor);
    expect(afterUpdate[0]).toMatchObject({ url: "https://parceiro.example.com/hook2", events: ["list.archived"] });

    const revealed1 = await revealSecret(admin, actor, endpointId);
    expect(decryptSecret(revealed1, ENCRYPTION_KEY)).toBe(secret1);

    const secret2 = "whsec_" + randomBytes(32).toString("base64url");
    const enc2 = encryptSecret(secret2, ENCRYPTION_KEY);
    await rotateSecret(admin, actor, endpointId, { ...enc2, keyVersion: 2 });
    const revealed2 = await revealSecret(admin, actor, endpointId);
    expect(decryptSecret(revealed2, ENCRYPTION_KEY)).toBe(secret2);
    expect(revealed2.keyVersion).toBe(2);

    const deliveries = await listMyDeliveries(admin, actor);
    expect(deliveries).toEqual([]);

    await expectCode(resendDelivery(admin, actor, "00000000-0000-4000-8000-000000000099"), "not_found");
  });

  it("quem não é dono do endpoint não revela nem atualiza (vira not_found, nunca expõe existência)", async () => {
    const partnerId = await withSuperuser((c) => seedPartner(c, { status: "active", ownerId: IDS.school_member }));
    partnerIds.push(partnerId);
    const owner = await actorOf(IDS.school_member, "school_member");
    const enc = encryptSecret("whsec_x", ENCRYPTION_KEY);
    const { endpointId } = await createEndpoint(admin, owner, { url: "https://outro.example.com/hook", events: ["list.published"], ...enc, keyVersion: 1 });

    const stranger = await actorOf(IDS.parent, "parent");
    await expectCode(revealSecret(admin, stranger, endpointId), "not_found");
    await expectCode(updateEndpoint(admin, stranger, endpointId, { url: "https://x.example.com/hook", events: ["list.published"] }), "not_found");
  });
});
