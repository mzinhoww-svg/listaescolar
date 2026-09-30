// S29 T12 · UX-027: avaliação sem nota é recusada com mensagem própria, sem chamar o serviço.
import { beforeEach, describe, expect, it, vi } from "vitest";

const createReview = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`REDIRECT:${to}`); } }));
vi.mock("@/features/stationeries/actor", () => ({ getSessionActor: async () => ({ userId: "u", role: "parent" }) }));
vi.mock("@/features/conversion/wiring", () => ({ getConversionService: () => ({ createReview }) }));

import { createReviewAction } from "@/features/conversion/actions";

const LEAD = "11111111-1111-4111-8111-111111111111";
const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.append(k, v);
  return f;
};

beforeEach(() => createReview.mockReset());

describe("createReviewAction", () => {
  it("sem nota: volta com rating_required e não chama o serviço", async () => {
    await expect(createReviewAction(form({ leadId: LEAD, comment: "ótimo" }))).rejects.toThrow("REDIRECT:/conta/compras?erro=rating_required");
    expect(createReview).not.toHaveBeenCalled();
  });

  it("com nota escolhida segue para o serviço", async () => {
    createReview.mockResolvedValue("id");
    await expect(createReviewAction(form({ leadId: LEAD, rating: "4" }))).rejects.toThrow("REDIRECT:/conta/compras?ok=avaliado");
    expect(createReview.mock.calls[0]![1]).toMatchObject({ leadId: LEAD, rating: 4 });
  });
});
