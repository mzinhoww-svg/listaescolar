import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { notifyInputSchema } from "@/features/submissions/form-schema";
import { attempt, cleanupUsers, seedUsers, withClaims, withSuperuser } from "./helpers";
import { insertJob, insertSubmission, purgeQueues, SUB } from "./s07-fixtures";

const ID = SUB.parent;
const parse = (channel: "email" | "whatsapp", target: string) => notifyInputSchema.safeParse({ submissionId: ID, channel, target });

const VALID = [
  ["whatsapp", "(65) 99999-0000"],
  ["whatsapp", "65999990000"],
  ["whatsapp", "6533334444"],
  ["whatsapp", "+55 65 99999-0000"],
  ["whatsapp", "+1 (415) 555-2671"],
  ["whatsapp", "5565999990000"],
  ["email", " Pai@Exemplo.com "],
] as const;
const INVALID = [
  ["whatsapp", "+0655599990"],
  ["whatsapp", "+1234567"],
  ["whatsapp", "+1234567890123456"],
  ["whatsapp", "99999"],
  ["whatsapp", "abc"],
  ["email", "sem-arroba"],
] as const;

describe("Zod notifyInputSchema → CHECK de jobs.notify_target", () => {
  beforeAll(seedUsers);
  afterAll(async () => {
    await withSuperuser((c) => purgeQueues(c));
    await cleanupUsers();
  });
  beforeEach(async () => {
    await withSuperuser(async (c) => {
      await purgeQueues(c);
      await c.query("delete from public.list_submissions");
      await c.query("delete from public.jobs");
      await insertSubmission(c, "parent");
      await insertJob(c, SUB.parent, "zod-check-job");
    });
  });

  it.each(VALID)("saída válida do schema (%s, %j) é aceita pelo banco via cliente do usuário", async (channel, input) => {
    const r = parse(channel, input);
    expect(r.success).toBe(true);
    if (!r.success) return;
    await withClaims("parent", async (c) => {
      const u = await attempt(c, "update public.jobs set notify_channel = $1::public.notify_channel, notify_target = $2", [r.data.channel, r.data.target]);
      expect(u.error).toBeNull();
      expect(u.rowCount).toBe(1);
    });
  });

  it.each(INVALID)("entrada inválida (%s, %j) é recusada já no Zod", (channel, input) => {
    expect(parse(channel, input).success).toBe(false);
  });
});
