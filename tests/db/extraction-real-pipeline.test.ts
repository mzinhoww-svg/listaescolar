import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Client } from "pg";
import { createAiPipeline } from "@/supabase/functions/_shared/ai/composition";
import { createValidatedRpc } from "@/supabase/functions/_shared/ai/rpc";
import { withClaims } from "./helpers";

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
const good = {
  json: {
    items: [
      {
        name: "Caderno brochura",
        quantity: 2,
        unit: "un",
        category: "papelaria",
        confidence: 0.95,
        flags: [],
      },
    ],
    overallConfidence: 0.95,
  },
};
const ENV = {
  NODE_ENV: "test",
  APP_ENV: "local",
  FAKE_AI_SCRIPT: JSON.stringify({
    cheap: [{ text: "não é json" }],
    strong: [good],
    vision: [good],
  }),
};

/** RpcClient sobre o Postgres local com o papel service_role (as mesmas funções que o supabase-js chama). */
function rpcOver(c: Client) {
  return createValidatedRpc({
    async rpc(fn, args) {
      await c.query("savepoint rpc");
      try {
        if (fn === "ai_get_settings")
          return {
            data: (await c.query("select to_jsonb(public.ai_get_settings()) as r")).rows[0].r,
            error: null,
          };
        if (fn === "ai_get_active_prompt")
          return {
            data: (
              await c.query("select to_jsonb(public.ai_get_active_prompt($1)) as r", [args?.p_key])
            ).rows[0].r,
            error: null,
          };
        return {
          data: (
            await c.query("select public.ai_record_decision($1::jsonb) as r", [
              JSON.stringify(args?.p_decision),
            ])
          ).rows[0].r,
          error: null,
        };
      } catch (e) {
        await c.query("rollback to savepoint rpc"); // erro de função (P0002) não aborta o teste inteiro
        return { data: null, error: e };
      }
    },
  });
}

/** Configuração viva: as três rotas no provedor fake (dado, não deploy). Escrita como dono; volta ao service_role. */
async function useFakeRoutes(c: Client) {
  await c.query("reset role");
  const r = { provider: "fake", timeout_ms: 20000 };
  await c.query("update public.ai_settings set routes = $1::jsonb", [
    JSON.stringify({ cheap: r, strong: r, vision: r }),
  ]);
  await c.query("set local role service_role");
}

describe("pipeline real (provedor falso) contra o banco", () => {
  it("barato inválido -> forte aceita; ai_decisions guarda a cadeia com entity_id do envio e sem conteúdo do documento", async () => {
    await withClaims("system", async (c) => {
      await useFakeRoutes(c);
      const submissionId = randomUUID();
      const pipeline = createAiPipeline({ env: ENV, rpc: rpcOver(c), budgetMs: 10_000 });
      const r = await pipeline.extract(
        { submissionId, bytes: PDF, mime: "application/pdf", grade: "3º ano", schoolYear: 2027 },
        { signal: new AbortController().signal },
      );
      expect(r.items[0]?.normalizedName).toBe("caderno brochura");
      const rows = (
        await c.query("select * from public.ai_decisions where entity_id = $1 order by attempt", [
          submissionId,
        ])
      ).rows;
      expect(rows.map((d) => [d.decision, d.attempt, d.provider, d.model])).toEqual([
        ["escalated", 1, "fake", "fake-cheap"],
        ["accepted", 2, "fake", "fake-strong"],
      ]);
      expect(
        rows.every(
          (d) =>
            d.entity_type === "list_submission" &&
            d.prompt_key === "extract_list" &&
            d.pipeline_version === "s08.1",
        ),
      ).toBe(true);
      expect(JSON.stringify(rows)).not.toMatch(/caderno|brochura/i);
    });
  });

  it("sem linha em ai_settings: falha fechada (P0002) e nenhuma decisão", async () => {
    await withClaims("system", async (c) => {
      await c.query("reset role");
      await c.query("delete from public.ai_settings");
      await c.query("set local role service_role");
      const submissionId = randomUUID();
      const pipeline = createAiPipeline({ env: ENV, rpc: rpcOver(c), budgetMs: 10_000 });
      await expect(
        pipeline.extract(
          { submissionId, bytes: PDF, mime: "application/pdf" },
          { signal: new AbortController().signal },
        ),
      ).rejects.toMatchObject({ code: "ai_not_configured" });
      expect(
        (
          await c.query("select count(*)::int as n from public.ai_decisions where entity_id = $1", [
            submissionId,
          ])
        ).rows[0].n,
      ).toBe(0);
    });
  });
});
