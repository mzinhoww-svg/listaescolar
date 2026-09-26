import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.fn();
const getCurrentRole = vi.fn();
const svc = { publishPlan: vi.fn() };
const revalidatePath = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));
vi.mock("@/features/auth/queries", () => ({ getCurrentUser: () => getCurrentUser(), getCurrentRole: () => getCurrentRole() }));
vi.mock("@/features/billing/wiring", () => ({ getBillingService: () => svc }));

import { publishPlanAction } from "@/features/billing/admin-actions";
import { BillingError } from "@/features/billing/errors";

const ADMIN = "22222222-2222-4222-8222-222222222222";

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.append(k, v);
  return f;
};

const VALID_FIELDS = {
  freeLeads: "2",
  freeLeadsValidityDays: "90",
  seasonStartMonth: "11",
  seasonEndMonth: "3",
  "tiers.0.minItems": "1",
  "tiers.0.maxItems": "20",
  "tiers.0.priceCents": "5,00",
  "tiers.1.minItems": "21",
  "tiers.1.maxItems": "",
  "tiers.1.priceCents": "9,00",
  "packages.0.amountCents": "50,00",
  "packages.1.amountCents": "100,00",
  passEnabled: "on",
  passPriceCents: "300,00",
  passIncludedLeads: "40",
  passMaxInstallments: "3",
};

async function redirected(p: Promise<unknown>): Promise<string> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(Error);
  const m = /^REDIRECT:(.*)$/.exec((err as Error).message);
  if (!m) throw err;
  return m[1]!;
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: ADMIN, email: "admin@example.test" });
  getCurrentRole.mockResolvedValue("admin");
});

describe("publishPlanAction", () => {
  it("não-admin: 403 sem chamar o serviço", async () => {
    getCurrentRole.mockResolvedValue("stationery_member");
    const to = await redirected(publishPlanAction(form(VALID_FIELDS)));
    expect(to).toBe("/403");
    expect(svc.publishPlan).not.toHaveBeenCalled();
  });

  it("campos essenciais ausentes: ?erro=invalid_plan sem chamar o serviço", async () => {
    const to = await redirected(publishPlanAction(form({ freeLeads: "2" })));
    expect(to).toBe("/admin/planos?erro=invalid_plan");
    expect(svc.publishPlan).not.toHaveBeenCalled();
  });

  it("plano válido: monta o PlanDraft certo (faixas, pacotes, passe) e publica", async () => {
    svc.publishPlan.mockResolvedValue("plan-id");
    const to = await redirected(publishPlanAction(form(VALID_FIELDS)));
    expect(to).toBe("/admin/planos?ok=1");
    expect(svc.publishPlan).toHaveBeenCalledTimes(1);
    const [actor, draft] = svc.publishPlan.mock.calls[0]!;
    expect(actor).toMatchObject({ userId: ADMIN, role: "admin" });
    expect(draft).toEqual({
      freeLeads: 2,
      freeLeadsValidityDays: 90,
      season: { startMonth: 11, endMonth: 3 },
      tiers: [
        { minItems: 1, maxItems: 20, priceCents: 500 },
        { minItems: 21, maxItems: null, priceCents: 900 },
      ],
      packages: [{ amountCents: 5000 }, { amountCents: 10000 }],
      pass: { priceCents: 30000, includedLeads: 40, maxInstallments: 3 },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/planos");
    expect(revalidatePath).toHaveBeenCalledWith("/papelaria/creditos");
  });

  it("linha de faixa em branco é ignorada (sem quebrar as demais)", async () => {
    svc.publishPlan.mockResolvedValue("plan-id");
    await redirected(publishPlanAction(form({ ...VALID_FIELDS, "tiers.2.minItems": "", "tiers.2.priceCents": "" })));
    const [, draft] = svc.publishPlan.mock.calls[0]!;
    expect(draft.tiers).toHaveLength(2);
  });

  it("passEnabled ausente: plano sem passe (pass: null), mesmo com os campos preenchidos", async () => {
    svc.publishPlan.mockResolvedValue("plan-id");
    const rest: Record<string, string> = { ...VALID_FIELDS };
    delete rest.passEnabled;
    await redirected(publishPlanAction(form(rest)));
    const [, draft] = svc.publishPlan.mock.calls[0]!;
    expect(draft.pass).toBeNull();
  });

  it("preço de faixa malformado: ?erro=invalid_plan sem chamar o serviço", async () => {
    const to = await redirected(publishPlanAction(form({ ...VALID_FIELDS, "tiers.0.priceCents": "12,5x" })));
    expect(to).toBe("/admin/planos?erro=invalid_plan");
    expect(svc.publishPlan).not.toHaveBeenCalled();
  });

  it("erro do serviço (faixas inválidas no lado do banco): ?erro=invalid_plan", async () => {
    svc.publishPlan.mockRejectedValue(new BillingError("faixas inválidas", "invalid_plan"));
    const to = await redirected(publishPlanAction(form(VALID_FIELDS)));
    expect(to).toBe("/admin/planos?erro=invalid_plan");
  });
});
