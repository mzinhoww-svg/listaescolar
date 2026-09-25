import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.fn();
const getCurrentRole = vi.fn();
const svc = {
  createLead: vi.fn(),
  openWhatsapp: vi.fn(),
  cancelLead: vi.fn(),
  updateStatus: vi.fn(),
  declareSale: vi.fn(),
  closeLost: vi.fn(),
};
const revalidatePath = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));
vi.mock("@/features/auth/queries", () => ({ getCurrentUser: () => getCurrentUser(), getCurrentRole: () => getCurrentRole() }));
vi.mock("@/features/leads/wiring", () => ({ getLeadService: () => svc }));

import { LeadError } from "@/features/leads/errors";
import {
  cancelLeadAction,
  closeLostAction,
  createLeadAction,
  declareSaleAction,
  openWhatsappAction,
  updateLeadStatusAction,
} from "@/features/leads/actions";

const USER = "22222222-2222-4222-8222-222222222222";
const CART = "55555555-5555-4555-8555-555555555555";
const STAT = "44444444-4444-4444-8444-444444444444";
const KEY = "77777777-7777-4777-8777-777777777777";
const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.append(k, v);
  return f;
};
async function redirected(p: Promise<unknown>): Promise<string> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(Error);
  const m = /^REDIRECT:(.*)$/.exec((err as Error).message);
  if (!m) throw err;
  return m[1] as string;
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: USER });
  getCurrentRole.mockResolvedValue("parent");
});

describe("createLeadAction", () => {
  const ok = { carrinho: CART, stationeryId: STAT, consent: "on", idempotencyKey: KEY };

  it("sem sessão: login com next", async () => {
    getCurrentUser.mockResolvedValue(null);
    expect(await redirected(createLeadAction(form(ok)))).toBe(`/entrar?next=${encodeURIComponent("/cotacao/nova?carrinho=" + CART)}`);
    expect(svc.createLead).not.toHaveBeenCalled();
  });

  it("checkbox marcado vira consent true; sucesso vai ao código", async () => {
    svc.createLead.mockResolvedValue({ leadId: "x", code: "LC-5TJ1", created: true });
    expect(await redirected(createLeadAction(form({ ...ok, neighborhood: "Centro" })))).toBe("/cotacao/LC-5TJ1");
    const [, raw] = svc.createLead.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(raw).toEqual({ cartId: CART, stationeryId: STAT, neighborhood: "Centro", consent: true, idempotencyKey: KEY });
  });

  it("sem o checkbox: consent false e o erro vira ?erro=código", async () => {
    svc.createLead.mockRejectedValue(new LeadError("x", "consent_required"));
    const { consent: _c, ...noConsent } = ok;
    void _c;
    expect(await redirected(createLeadAction(form(noConsent)))).toBe(`/cotacao/nova?carrinho=${CART}&erro=consent_required`);
    expect((svc.createLead.mock.calls[0] as [unknown, { consent: boolean }])[1].consent).toBe(false);
  });

  it("erro desconhecido vira 'desconhecido' e nunca ecoa texto", async () => {
    svc.createLead.mockRejectedValue(new Error("detalhe interno <script>"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const to = await redirected(createLeadAction(form(ok)));
    spy.mockRestore();
    expect(to).toBe(`/cotacao/nova?carrinho=${CART}&erro=desconhecido`);
  });

  it("?carrinho inválido não vai para a URL de retorno", async () => {
    svc.createLead.mockRejectedValue(new LeadError("x", "invalid_input"));
    expect(await redirected(createLeadAction(form({ ...ok, carrinho: "../../evil" })))).toBe("/cotacao/nova?erro=invalid_input");
  });
});

describe("openWhatsappAction", () => {
  it("redireciona para o wa.me devolvido pelo serviço", async () => {
    svc.openWhatsapp.mockResolvedValue({ url: "https://wa.me/5565999990000?text=oi" });
    expect(await redirected(openWhatsappAction(form({ code: "LC-5TJ1" })))).toBe("https://wa.me/5565999990000?text=oi");
  });

  it("recusa URL que não seja wa.me mesmo se o serviço devolver (defesa em profundidade)", async () => {
    svc.openWhatsapp.mockResolvedValue({ url: "https://evil.example/x" });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const to = await redirected(openWhatsappAction(form({ code: "LC-5TJ1" })));
    spy.mockRestore();
    expect(to).toBe("/cotacao/LC-5TJ1?erro=whatsapp_unavailable");
  });

  it("erro do serviço volta à confirmação com código", async () => {
    svc.openWhatsapp.mockRejectedValue(new LeadError("x", "expired"));
    expect(await redirected(openWhatsappAction(form({ code: "LC-5TJ1" })))).toBe("/cotacao/LC-5TJ1?erro=expired");
  });

  it("código inválido cai na lista, sem eco", async () => {
    expect(await redirected(openWhatsappAction(form({ code: "<x>" })))).toBe("/cotacao?erro=not_found");
    expect(svc.openWhatsapp).not.toHaveBeenCalled();
  });
});

describe("cancelLeadAction", () => {
  it("cancela e volta ao lead", async () => {
    svc.cancelLead.mockResolvedValue("cancelled");
    expect(await redirected(cancelLeadAction(form({ code: "LC-5TJ1" })))).toBe("/cotacao/LC-5TJ1?ok=cancelado");
    expect(svc.cancelLead).toHaveBeenCalledWith(expect.anything(), { code: "LC-5TJ1" });
    expect(revalidatePath).toHaveBeenCalled();
  });
  it("erro vira código", async () => {
    svc.cancelLead.mockRejectedValue(new LeadError("x", "transition_not_allowed"));
    expect(await redirected(cancelLeadAction(form({ code: "LC-5TJ1" })))).toBe("/cotacao/LC-5TJ1?erro=transition_not_allowed");
  });
});

describe("ações da papelaria", () => {
  beforeEach(() => getCurrentRole.mockResolvedValue("stationery_member"));

  it("sem sessão vai ao login", async () => {
    getCurrentUser.mockResolvedValue(null);
    expect(await redirected(updateLeadStatusAction(form({ code: "LC-5TJ1", to: "in_progress" })))).toBe(`/entrar?next=${encodeURIComponent("/papelaria/leads/LC-5TJ1")}`);
  });

  it("updateLeadStatusAction", async () => {
    svc.updateStatus.mockResolvedValue("quote_sent");
    expect(await redirected(updateLeadStatusAction(form({ code: "LC-5TJ1", to: "quote_sent", amount: "10,00" })))).toBe("/papelaria/leads/LC-5TJ1?ok=1");
    expect(svc.updateStatus).toHaveBeenCalledWith(expect.anything(), { code: "LC-5TJ1", to: "quote_sent", amount: "10,00" });
    svc.updateStatus.mockRejectedValue(new LeadError("x", "amount_invalid"));
    expect(await redirected(updateLeadStatusAction(form({ code: "LC-5TJ1", to: "quote_sent", amount: "x" })))).toBe("/papelaria/leads/LC-5TJ1?erro=amount_invalid");
  });

  it("declareSaleAction e closeLostAction", async () => {
    svc.declareSale.mockResolvedValue("converted");
    expect(await redirected(declareSaleAction(form({ code: "LC-5TJ1", amount: "" })))).toBe("/papelaria/leads/LC-5TJ1?ok=1");
    svc.closeLost.mockRejectedValue(new LeadError("x", "reason_required"));
    expect(await redirected(closeLostAction(form({ code: "LC-5TJ1", reason: "" })))).toBe("/papelaria/leads/LC-5TJ1?erro=reason_required");
    svc.closeLost.mockResolvedValue("declined");
    expect(await redirected(closeLostAction(form({ code: "LC-5TJ1", reason: "price" })))).toBe("/papelaria/leads/LC-5TJ1?ok=1");
  });

  it("código inválido vai à lista da papelaria", async () => {
    expect(await redirected(declareSaleAction(form({ code: "nope" })))).toBe("/papelaria/leads?erro=not_found");
    expect(svc.declareSale).not.toHaveBeenCalled();
  });
});
