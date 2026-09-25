import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.fn();
const getCurrentRole = vi.fn();
const getStationeryOfOwner = vi.fn();
const registerStationery = vi.fn();
const transition = vi.fn();
const setAreas = vi.fn();
const upsertCatalogItems = vi.fn();
const maybeSingle = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));
vi.mock("@/features/auth/queries", () => ({
  getCurrentUser: () => getCurrentUser(),
  getCurrentRole: () => getCurrentRole(),
}));
vi.mock("@/features/stationeries/queries", () => ({ getStationeryOfOwner: (...a: unknown[]) => getStationeryOfOwner(...a) }));
vi.mock("@/features/stationeries/repository", () => ({
  registerStationery: (...a: unknown[]) => registerStationery(...a),
  transition: (...a: unknown[]) => transition(...a),
  setAreas: (...a: unknown[]) => setAreas(...a),
  upsertCatalogItems: (...a: unknown[]) => upsertCatalogItems(...a),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => maybeSingle() }) }) }) }),
  }),
}));

import { registerStationeryAction, resubmitAction } from "@/app/cadastrar-papelaria/actions";
import { adminTransitionAction } from "@/app/admin/papelarias/actions";
import { saveAreasAction } from "@/app/papelaria/areas/actions";
import { ownerStatusAction } from "@/app/papelaria/actions";
import { importCatalogAction, saveItemAction } from "@/app/papelaria/catalogo/actions";

const USER = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const STAT = "44444444-4444-4444-8444-444444444444";
const MUNI = "11111111-1111-4111-8111-111111111111";
const form = (o: Record<string, string | string[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) for (const x of Array.isArray(v) ? v : [v]) f.append(k, x);
  return f;
};
const run = (p: Promise<unknown>) =>
  p.then(
    (v) => v,
    (e: Error) => e.message,
  );
const good = {
  tradeName: "Papelaria Boa",
  legalName: "Boa Comércio Ltda",
  cnpj: "11.222.333/0001-81",
  municipalityId: MUNI,
  neighborhood: "Centro",
  whatsapp: "(65) 99999-1234",
  offersPickup: "on",
  lgpdAccepted: "on",
};

beforeEach(() => {
  for (const m of [getCurrentUser, getCurrentRole, getStationeryOfOwner, registerStationery, transition, setAreas, upsertCatalogItems, maybeSingle]) m.mockReset();
  getCurrentUser.mockResolvedValue({ id: USER });
  getCurrentRole.mockResolvedValue("parent");
  maybeSingle.mockResolvedValue({ data: { id: MUNI }, error: null });
  registerStationery.mockResolvedValue({ id: STAT, slug: "papelaria-boa" });
  transition.mockResolvedValue("under_review");
  getStationeryOfOwner.mockResolvedValue({ id: STAT, status: "approved" });
});

describe("registerStationeryAction", () => {
  it("parent: cria com o dono da sessão e envia à análise (accreditation, under_review)", async () => {
    expect(await run(registerStationeryAction({ status: "idle" }, form({ ...good, ownerId: OTHER })))).toBe("REDIRECT:/cadastrar-papelaria");
    expect(registerStationery.mock.calls[0]?.[1].ownerId).toBe(USER);
    expect(transition.mock.calls.map((c) => [c[1].to, c[1].actorId, c[1].actorRole])).toEqual([
      ["accreditation", USER, "owner"],
      ["under_review", USER, "owner"],
    ]);
  });

  it.each(["school_member", "admin", "stationery_member"])("%s recebe a mensagem e nada é criado", async (role) => {
    getCurrentRole.mockResolvedValue(role);
    const r = await registerStationeryAction({ status: "idle" }, form(good));
    expect(r).toMatchObject({ status: "error", message: expect.stringContaining("responsável") });
    expect(registerStationery).not.toHaveBeenCalled();
  });

  it("CNPJ inválido é bloqueado antes do banco", async () => {
    const r = await registerStationeryAction({ status: "idle" }, form({ ...good, cnpj: "11.111.111/1111-11" }));
    expect(r).toMatchObject({ status: "error", errors: { cnpj: expect.any(String) } });
    expect(registerStationery).not.toHaveBeenCalled();
  });

  it("município não habilitado é recusado", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const r = await registerStationeryAction({ status: "idle" }, form(good));
    expect(r).toMatchObject({ status: "error", errors: { municipalityId: expect.any(String) } });
    expect(registerStationery).not.toHaveBeenCalled();
  });

  it("anônimo vai ao login", async () => {
    getCurrentUser.mockResolvedValue(null);
    expect(await run(registerStationeryAction({ status: "idle" }, form(good)))).toContain("REDIRECT:/entrar");
  });

  it("CNPJ já cadastrado: erro no campo", async () => {
    const err = Object.assign(new Error("dup"), { name: "StationeryRepositoryError", code: "cnpj_taken" });
    registerStationery.mockRejectedValue(err);
    const r = await registerStationeryAction({ status: "idle" }, form(good));
    expect(r).toMatchObject({ status: "error", errors: { cnpj: expect.any(String) } });
  });

  it("falha ao enviar à análise: cadastro fica salvo e vai ao credenciamento com aviso", async () => {
    transition.mockRejectedValue(new Error("x"));
    expect(await run(registerStationeryAction({ status: "idle" }, form(good)))).toBe("REDIRECT:/cadastrar-papelaria?erro=envio");
  });
});

describe("resubmitAction", () => {
  it("rejected: reabre e envia à análise; ator da sessão", async () => {
    getStationeryOfOwner.mockResolvedValue({ id: STAT, status: "rejected" });
    expect(await run(resubmitAction())).toBe("REDIRECT:/cadastrar-papelaria");
    expect(transition.mock.calls.map((c) => c[1].to)).toEqual(["accreditation", "under_review"]);
    expect(getStationeryOfOwner).toHaveBeenCalledWith(USER);
  });
  it("estado que não permite reenvio: nada acontece", async () => {
    getStationeryOfOwner.mockResolvedValue({ id: STAT, status: "active" });
    await run(resubmitAction());
    expect(transition).not.toHaveBeenCalled();
  });
});

describe("ownerStatusAction", () => {
  beforeEach(() => getCurrentRole.mockResolvedValue("stationery_member"));
  it("publica a papelaria do dono da sessão (id nunca vem do formulário)", async () => {
    expect(await run(ownerStatusAction(form({ to: "active", id: OTHER })))).toBe("REDIRECT:/papelaria?ok=1");
    expect(transition.mock.calls[0]?.[1]).toMatchObject({ id: STAT, to: "active", actorId: USER, actorRole: "owner" });
  });
  it("destino inválido (ex.: suspended) e papel parent não passam", async () => {
    expect(await run(ownerStatusAction(form({ to: "suspended" })))).toBe("REDIRECT:/papelaria?erro=invalido");
    getCurrentRole.mockResolvedValue("parent");
    expect(await run(ownerStatusAction(form({ to: "active" })))).toBe("REDIRECT:/403");
    expect(transition).not.toHaveBeenCalled();
  });
  it("transição negada mostra mensagem clara", async () => {
    transition.mockRejectedValue(Object.assign(new Error("x"), { name: "StationeryRepositoryError", code: "transition_not_allowed" }));
    expect(await run(ownerStatusAction(form({ to: "active" })))).toContain("REDIRECT:/papelaria?erro=");
  });
});

describe("adminTransitionAction", () => {
  beforeEach(() => getCurrentRole.mockResolvedValue("admin"));
  it("aprova com ator admin da sessão", async () => {
    expect(await run(adminTransitionAction(form({ id: STAT, to: "approved", back: "list" })))).toBe("REDIRECT:/admin/papelarias?ok=1");
    expect(transition.mock.calls[0]?.[1]).toMatchObject({ id: STAT, to: "approved", actorId: USER, actorRole: "admin" });
  });
  it("suspende com motivo", async () => {
    await run(adminTransitionAction(form({ id: STAT, to: "suspended", reason: " fraude " })));
    expect(transition.mock.calls[0]?.[1]).toMatchObject({ to: "suspended", reason: "fraude" });
  });
  it.each(["parent", "stationery_member", "school_member"])("%s não passa", async (role) => {
    getCurrentRole.mockResolvedValue(role);
    expect(await run(adminTransitionAction(form({ id: STAT, to: "approved" })))).toBe("REDIRECT:/403");
    expect(transition).not.toHaveBeenCalled();
  });
  it("id ou destino inválidos", async () => {
    expect(await run(adminTransitionAction(form({ id: "x", to: "approved" })))).toContain("erro=invalido");
    expect(await run(adminTransitionAction(form({ id: STAT, to: "hacked" })))).toContain("erro=invalido");
  });
});

describe("areas e catálogo", () => {
  beforeEach(() => getCurrentRole.mockResolvedValue("stationery_member"));
  it("bairros da papelaria do dono", async () => {
    expect(await run(saveAreasAction(form({ areas: "Centro\nJardim" })))).toBe("REDIRECT:/papelaria/areas?ok=1");
    expect(setAreas.mock.calls[0]?.slice(1)).toEqual([STAT, USER, ["Centro", "Jardim"]]);
  });
  it("parent não acessa", async () => {
    getCurrentRole.mockResolvedValue("parent");
    expect(await run(saveAreasAction(form({ areas: "Centro" })))).toBe("REDIRECT:/403");
    expect(await run(saveItemAction(form({ name: "Lápis", price: "1,50" })))).toBe("REDIRECT:/403");
    expect(await run(importCatalogAction({ status: "idle" }, form({})))).toBe("REDIRECT:/403");
  });
  it("item: preço em centavos, origem fixa no repositório", async () => {
    expect(await run(saveItemAction(form({ name: "Lápis HB", price: "1,50", stock: "sim" })))).toBe("REDIRECT:/papelaria/catalogo?ok=item");
    expect(upsertCatalogItems.mock.calls[0]?.[3]).toEqual([{ name: "Lápis HB", priceCents: 150, stock: "in_stock" }]);
  });
  it("preço inválido não grava", async () => {
    expect(await run(saveItemAction(form({ name: "Lápis", price: "abc" })))).toContain("erro=");
    expect(upsertCatalogItems).not.toHaveBeenCalled();
  });
  it("importação: linhas boas entram; ruins voltam no relatório neutralizado", async () => {
    const csv = 'nome;preco;estoque\nLápis;1,50;sim\n=CMD();2,00;\nCaneta;xx;\n';
    const fd = new FormData();
    fd.set("file", new File([csv], "c.csv", { type: "text/csv" }));
    const r = await importCatalogAction({ status: "idle" }, fd);
    expect(r).toMatchObject({ status: "done", imported: 1, errorCount: 2 });
    expect(upsertCatalogItems.mock.calls[0]?.[3]).toEqual([{ name: "Lápis", priceCents: 150, stock: "in_stock" }]);
    if (r.status === "done") expect(decodeURIComponent(r.reportHref ?? "")).toContain("'=CMD()");
  });
  it("planilha sem colunas: erro fatal, nada gravado; sem arquivo: erro", async () => {
    const fd = new FormData();
    fd.set("file", new File(["a;b\n1;2\n"], "c.csv"));
    expect(await importCatalogAction({ status: "idle" }, fd)).toMatchObject({ status: "error" });
    expect(await importCatalogAction({ status: "idle" }, new FormData())).toMatchObject({ status: "error" });
    expect(upsertCatalogItems).not.toHaveBeenCalled();
  });
});
