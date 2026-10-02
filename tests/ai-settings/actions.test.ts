// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const update = vi.fn();
vi.mock("@/features/auth/actor", () => ({ getSessionActor: async () => ({ userId: "a", role: "admin" }) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: () => ({ update: (row: unknown) => { update(row); return { eq: async () => ({ error: null }) }; } }) }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));

import { updateAiSettingsAction } from "@/features/ai-settings/actions";
import { CRITICAL_ALERT_CODES } from "@/features/ai-settings/ports";

const BASE: Record<string, string> = {
  confidenceThreshold: "0.9",
  itemConfidenceThreshold: "0.8",
  maxEscalations: "2",
  pipelineVersion: "v1",
};
const form = (extra: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ ...BASE, ...extra })) fd.set(k, v);
  fd.append("criticalAlerts", CRITICAL_ALERT_CODES[0]);
  return fd;
};
const run = async (fd: FormData) => {
  try {
    await updateAiSettingsAction(fd);
  } catch (e) {
    return (e as Error).message;
  }
  return "";
};

describe("updateAiSettingsAction: usdBrlRate (revisão M8)", () => {
  beforeEach(() => update.mockReset());

  it("campo AUSENTE do FormData não apaga a taxa (a coluna nem entra no update)", async () => {
    const r = await run(form({}));
    expect(r).toBe("REDIRECT:/admin/ia?ok=1");
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0]![0]).not.toHaveProperty("usd_brl_rate");
  });

  it("campo VAZIO apaga a taxa de propósito (null)", async () => {
    await run(form({ usdBrlRate: "" }));
    expect(update.mock.calls[0]![0]).toMatchObject({ usd_brl_rate: null });
  });

  it("campo preenchido grava o valor (vírgula aceita)", async () => {
    await run(form({ usdBrlRate: "5,42" }));
    expect(update.mock.calls[0]![0]).toMatchObject({ usd_brl_rate: 5.42 });
  });

  it("valor inválido é recusado sem gravar", async () => {
    expect(await run(form({ usdBrlRate: "-1" }))).toBe("REDIRECT:/admin/ia?erro=invalido");
    expect(update).not.toHaveBeenCalled();
  });
});
