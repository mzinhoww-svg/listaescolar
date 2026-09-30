// S29 T12 · J2: `/cotacao/[code]`, `/cotacao`, consentimento e escolha de papelaria (UX-025, 028, 029, 031, 032, 035, 039).
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); }, usePathname: () => "/cotacao", redirect: vi.fn() }));
vi.mock("@/features/auth/guard", () => ({ requireAccess: vi.fn(async () => ({ user: { id: "u" }, role: "parent" })) }));
vi.mock("@/features/stationeries/actor", () => ({ getSessionActor: async () => ({ userId: "u", role: "parent" }) }));
const getMyLead = vi.fn();
const listMyLeads = vi.fn();
vi.mock("@/features/leads/queries", () => ({ getMyLead: (...a: unknown[]) => getMyLead(...a), listMyLeads: (...a: unknown[]) => listMyLeads(...a) }));
vi.mock("@/features/leads/actions", () => ({ cancelLeadAction: vi.fn(), openWhatsappAction: vi.fn(), createLeadAction: vi.fn() }));

import CotacaoDetailPage from "@/app/cotacao/[code]/page";
import CotacoesPage from "@/app/cotacao/page";
import { ConsentForm } from "@/app/cotacao/nova/ConsentForm";
import { StationeryCard } from "@/components/leads/StationeryCard";
import { StatusBadge } from "@/components/leads/StatusBadge";
import { chipClass } from "@/components/leads/chip";
import { estimateFromCatalog } from "@/features/leads/estimate";
import type { LeadStatus } from "@/features/leads/state";
import type { QuoteOptionView } from "@/features/leads/queries";

const ID = "11111111-1111-4111-8111-111111111111";
const lead = (over: Record<string, unknown> = {}) => ({
  id: ID, code: "LC-5TJ1", status: "received" as LeadStatus, stationeryId: ID, cartId: ID, listId: ID, schoolName: "Escola Demonstração", gradeLabel: "5º ano",
  schoolYear: 2027, itemCount: 3, expiresAt: new Date("2099-10-01T00:00:00Z"), createdAt: new Date("2026-09-25T14:48:00Z"), quotedTotalCents: null,
  quotedAt: null, stationeryName: "Papelaria Demo", isDemo: true, ...over,
});
const showDetail = async (over: Record<string, unknown> = {}) => {
  getMyLead.mockResolvedValue({ lead: lead(over), events: [] });
  return render(await CotacaoDetailPage({ params: Promise.resolve({ code: "LC-5TJ1" }), searchParams: Promise.resolve({}) } as never));
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SITE_URL = "https://listacerta.example";
});

describe("/cotacao/[code]", () => {
  it("UX-032: cancelar exige confirmação e o gatilho diz o que cancela", async () => {
    await showDetail();
    expect(screen.getByRole("button", { name: "Cancelar este pedido de cotação" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancelar pedido" , hidden: false })).toBeNull();
  });

  it("UX-039: um só retorno e status 'Novo' sem Verde Certo", async () => {
    const { container } = await showDetail();
    expect(screen.queryByRole("link", { name: "Voltar ao início" })).toBeNull();
    expect(screen.getAllByRole("link", { name: "Voltar" })).toHaveLength(1);
    expect(container.querySelector('[data-testid="lead-status"]')!.className).not.toContain("verde-certo");
  });

  it("UX-031: 'Abrir WhatsApp' é o canal do WhatsApp e o botão do pedido não usa Verde Certo como principal", async () => {
    const { container } = await showDetail();
    const b = screen.getByRole("button", { name: "Abrir WhatsApp" });
    expect(b.className).toContain("bg-verde-certo"); // variante whatsapp: exceção de canal (DESIGN.md)
    expect(container.querySelectorAll("button.bg-verde-certo")).toHaveLength(1);
  });

  it("UX-028: respondeu sem valor diz isso, esconde cancelar e a prévia e mostra como falar com a papelaria", async () => {
    await showDetail({ status: "quote_sent", quotedTotalCents: null });
    expect(screen.getByText("A papelaria respondeu sem informar valor")).toBeInTheDocument();
    expect(screen.queryByText(/Confira o valor abaixo/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancelar este pedido de cotação" })).toBeNull();
    expect(screen.queryByTestId("message-preview")).toBeNull();
    expect(screen.getByText(/Para saber o valor, fale com a papelaria pelo WhatsApp/)).toBeInTheDocument();
  });

  it("UX-028: com valor informado mantém 'Confira o valor abaixo'", async () => {
    await showDetail({ status: "quote_sent", quotedTotalCents: 12345, quotedAt: new Date("2026-09-26T12:00:00Z") });
    expect(screen.getByText("A papelaria informou o valor")).toBeInTheDocument();
    expect(screen.getByText(/Confira o valor abaixo/)).toBeInTheDocument();
  });

  it("UX-025: depois da resposta, 'Informar a compra' leva a /conta/compras; antes, não aparece", async () => {
    const { unmount } = await showDetail({ status: "quote_sent", quotedTotalCents: 12345, quotedAt: new Date() });
    expect(screen.getByRole("link", { name: "Informar a compra" })).toHaveAttribute("href", "/conta/compras");
    unmount();
    await showDetail({ status: "received" });
    expect(screen.queryByRole("link", { name: "Informar a compra" })).toBeNull();
  });

  it("UX-035: a prévia chama o endereço de 'Pedido na ListaCerta', não de 'Lista'", async () => {
    await showDetail();
    const txt = screen.getByTestId("message-preview").textContent!;
    expect(txt).toContain("Pedido na ListaCerta: https://listacerta.example/papelaria/leads/LC-5TJ1");
    expect(txt).not.toMatch(/^Lista:/m);
  });
});

describe("/cotacao", () => {
  it("UX-039: 'Voltar' leva a /conta", async () => {
    listMyLeads.mockResolvedValue([]);
    render(await CotacoesPage({ searchParams: Promise.resolve({}) } as never));
    expect(screen.getByRole("link", { name: "Voltar" })).toHaveAttribute("href", "/conta");
  });
});

describe("UX-031 · Tinta no lugar de Verde Certo", () => {
  const option: QuoteOptionView = {
    id: ID, slug: "p", name: "Papelaria Demo", neighborhood: "Centro", offersPickup: true, offersDelivery: false, paymentMethods: ["pix"],
    isDemo: true, candidates: [], estimate: estimateFromCatalog([], [], new Date()),
  };
  it("o cartão da papelaria pede a cotação em Tinta", () => {
    render(<ul><StationeryCard option={option} selectHref="/x" /></ul>);
    const a = screen.getByRole("link", { name: "Pedir cotação a Papelaria Demo" });
    expect(a.className).toContain("bg-tinta");
    expect(a.className).not.toContain("verde-certo");
  });
  it("estimativa parcial diz 'parcial' em corpo normal", () => {
    const e = { status: "partial", subtotalCents: 3480, pricedCount: 2, totalCount: 4, asOf: new Date() } as unknown as QuoteOptionView["estimate"];
    render(<ul><StationeryCard option={{ ...option, estimate: e }} selectHref="/x" /></ul>);
    expect(screen.getByText(/parcial: 2 de 4 itens com preço/)).toBeInTheDocument();
  });
  it("chip selecionado usa Tinta", () => {
    expect(chipClass(true)).toContain("bg-tinta");
    expect(chipClass(true)).not.toContain("verde-certo");
    expect(chipClass(false)).toContain("bg-campo");
  });
  it("status 'Novo' é neutro", () => {
    const { container } = render(<StatusBadge status="received" />);
    expect(container.innerHTML).not.toContain("verde-certo");
  });
});

describe("UX-029 · consentimento e envio único", () => {
  const props = { cartId: ID, stationeryId: ID, stationeryName: "Papelaria Demo", neighborhood: "", idempotencyKey: "77777777-7777-4777-8777-777777777777", preview: "Olá" };

  it("botão desabilitado explica o motivo ao lado e não é Verde Certo", () => {
    render(<ConsentForm action={vi.fn()} {...props} />);
    const submit = screen.getByRole("button", { name: "Confirmar pedido de cotação" });
    expect(submit).toBeDisabled();
    expect(submit.className).toContain("bg-tinta");
    expect(submit.className).not.toContain("verde-certo");
    const why = screen.getByText("Marque a caixa acima para confirmar o pedido.");
    expect(submit.getAttribute("aria-describedby")).toBe(why.id);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(submit).toBeEnabled();
    expect(screen.queryByText("Marque a caixa acima para confirmar o pedido.")).toBeNull();
  });

  it("segundo toque durante o envio é ignorado: uma chamada, botão anuncia o carregamento", async () => {
    const action = vi.fn(() => new Promise<void>(() => {}));
    render(<ConsentForm action={action} {...props} />);
    fireEvent.click(screen.getByRole("checkbox"));
    const submit = screen.getByRole("button", { name: "Confirmar pedido de cotação" });
    await act(async () => {
      fireEvent.click(submit);
    });
    await act(async () => {
      fireEvent.click(submit);
      fireEvent.submit(screen.getByRole("form"));
    });
    expect(action).toHaveBeenCalledTimes(1);
    const busy = screen.getByRole("button", { name: /Confirmar pedido de cotação/ });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(within(busy).queryByText("Enviando...")).toBeNull();
  });
});
