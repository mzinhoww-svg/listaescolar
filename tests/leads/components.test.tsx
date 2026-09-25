import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/papelaria/leads" }));
vi.mock("@/features/leads/actions", () => ({
  closeLostAction: vi.fn(),
  declareSaleAction: vi.fn(),
  updateLeadStatusAction: vi.fn(),
  createLeadAction: vi.fn(),
  openWhatsappAction: vi.fn(),
  cancelLeadAction: vi.fn(),
}));

import { FunnelTabs } from "@/components/leads/FunnelTabs";
import { ItemsTable } from "@/components/leads/ItemsTable";
import { KpiRow } from "@/components/leads/KpiRow";
import { LeadCards } from "@/components/leads/LeadCards";
import { LeadTable } from "@/components/leads/LeadTable";
import { eventLabel, moneyOrUnavailable, relativeWhen } from "@/components/leads/format";
import { StationeryCard } from "@/components/leads/StationeryCard";
import { StatusBadge } from "@/components/leads/StatusBadge";
import { Timeline } from "@/components/leads/Timeline";
import { PANEL_NAV } from "@/components/stationeries/PanelShell";
import { estimateFromCatalog } from "@/features/leads/estimate";
import { filterByMode, novaHref } from "@/features/leads/filters";
import type { LeadEventRow, StationeryLead } from "@/features/leads/repository";
import type { QuoteOptionView } from "@/features/leads/queries";
import { ConsentForm } from "@/app/cotacao/nova/ConsentForm";
import { StatusForm } from "@/app/papelaria/leads/[code]/StatusForm";

const NOW = new Date("2026-09-25T15:00:00Z");
const ID = "11111111-1111-4111-8111-111111111111";
const lead = (over: Partial<StationeryLead> = {}): StationeryLead => ({
  id: ID, code: "LC-5TJ1", status: "received", listId: ID, stationeryId: ID, schoolName: "Escola Demonstração", gradeLabel: "5º ano",
  schoolYear: 2027, neighborhood: null, itemCount: 3, expiresAt: new Date("2026-10-01T00:00:00Z"), quotedTotalCents: null, quotedAt: null,
  declaredSaleCents: null, declaredAt: null, closeReason: null, isDemo: true, createdAt: new Date("2026-09-25T14:48:00Z"), saleDeclaredAt: null, ...over,
});

describe("formatação", () => {
  it("dinheiro só com valor; senão indisponível", () => {
    expect(moneyOrUnavailable(1250)).toBe("R$ 12,50");
    expect(moneyOrUnavailable(null)).toBe("indisponível");
    expect(moneyOrUnavailable(-1)).toBe("indisponível");
  });
  it("tempo relativo", () => {
    expect(relativeWhen(new Date("2026-09-25T14:48:00Z"), NOW)).toBe("há 12 min");
    expect(relativeWhen(new Date("2026-09-25T12:00:00Z"), NOW)).toBe("há 3 h");
    expect(relativeWhen(new Date("2026-09-24T12:00:00Z"), NOW)).toBe("ontem");
  });
  it("rótulos da linha do tempo nunca inventam valor", () => {
    const e = (over: Partial<LeadEventRow>): LeadEventRow => ({ id: ID, eventType: "created", fromStatus: null, toStatus: null, actorRole: "parent", amountCents: null, createdAt: NOW, ...over });
    expect(eventLabel(e({ eventType: "quote_registered" }), "stationery")).toMatch(/sem valor informado/);
    expect(eventLabel(e({ eventType: "sale_declared", amountCents: 9000 }), "stationery")).toContain("R$ 90,00");
  });
});

describe("filtros e link", () => {
  it("Entrega e Retirada exigem a modalidade", () => {
    const o = [{ offersDelivery: true, offersPickup: false }, { offersDelivery: false, offersPickup: true }];
    expect(filterByMode(o, { entrega: true, retirada: false })).toHaveLength(1);
    expect(filterByMode(o, { entrega: true, retirada: true })).toHaveLength(0);
    expect(filterByMode(o, { entrega: false, retirada: false })).toHaveLength(2);
  });
  it("novaHref codifica o bairro", () => {
    expect(novaHref({ carrinho: ID, bairro: "São José & Cia" })).toBe(`/cotacao/nova?carrinho=${ID}&bairro=S%C3%A3o+Jos%C3%A9+%26+Cia`);
  });
  it("o menu da papelaria tem Leads", () => {
    expect(PANEL_NAV.map((i) => i.href)).toContain("/papelaria/leads");
  });
});

describe("painel de leads", () => {
  it("KPIs: indisponível sem dado (lista cortada)", () => {
    render(<KpiRow kpis={null} />);
    expect(within(screen.getByTestId("kpis")).getAllByText("indisponível")).toHaveLength(4);
  });
  it("KPIs com dados; valor do mês nulo vira indisponível", () => {
    render(<KpiRow kpis={{ newCount: 2, awaitingCount: 3, soldThisWeek: 1, declaredMonthCents: null }} />);
    const k = screen.getByTestId("kpis");
    expect(within(k).getByText("2")).toBeInTheDocument();
    expect(within(k).getAllByText("indisponível")).toHaveLength(1);
  });
  it("abas do funil com contagem e aba atual", () => {
    const counts = { all: 5, new: 2, opened: 1, attended: 1, sold: 1, closed: 0 };
    render(<FunnelTabs active="new" counts={counts} hrefFor={(t) => `/x?aba=${t}`} />);
    expect(screen.getByRole("link", { name: /Novos/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /Todos/ })).toHaveAttribute("href", "/x?aba=all");
  });
  it("tabela e cartões mostram o código, o selo Demonstração e valor só quando informado", () => {
    const rows = [lead(), lead({ id: "22222222-2222-4222-8222-222222222222", code: "LC-8HN4", status: "quote_sent", quotedTotalCents: 15050, isDemo: false })];
    render(<><LeadTable rows={rows} now={NOW} /><LeadCards rows={rows} now={NOW} /></>);
    expect(screen.getAllByTestId("lead-row")).toHaveLength(2);
    expect(screen.getAllByTestId("lead-card")).toHaveLength(2);
    expect(screen.getAllByText("Demonstração").length).toBeGreaterThan(0);
    expect(screen.getAllByText("R$ 150,50").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Abrir LC-5TJ1" })).toHaveAttribute("href", "/papelaria/leads/LC-5TJ1");
  });
  it("selo de status", () => {
    render(<StatusBadge status="viewed" />);
    expect(screen.getByTestId("lead-status")).toHaveTextContent("Lista aberta");
  });
});

describe("detalhe do lead", () => {
  const items = [{ itemKey: "lapis", name: "Lápis", quantity: 2 }, { itemKey: "cola", name: "Cola", quantity: 1 }];
  it("item sem catálogo é indisponível e o subtotal não é inventado", () => {
    render(<ItemsTable estimate={estimateFromCatalog(items, [], NOW)} />);
    expect(screen.getByTestId("subtotal")).toHaveTextContent("indisponível");
    expect(screen.getAllByText("não informado")).toHaveLength(2);
  });
  it("StatusForm oferece só transições válidas", () => {
    const { rerender } = render(<StatusForm code="LC-5TJ1" status="viewed" />);
    expect(screen.getByRole("button", { name: "Vendi" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Orçamento enviado" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Não fechou" })).toBeInTheDocument();
    rerender(<StatusForm code="LC-5TJ1" status="quote_sent" />);
    expect(screen.queryByRole("button", { name: "Orçamento enviado" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Valor da venda (opcional)")).toBeInTheDocument();
  });
  it("linha do tempo vazia e com eventos", () => {
    const { rerender } = render(<Timeline events={[]} side="stationery" />);
    expect(screen.getByText("Nenhum evento registrado.")).toBeInTheDocument();
    rerender(<Timeline events={[{ id: ID, eventType: "viewed", fromStatus: "received", toStatus: "viewed", actorRole: "stationery", amountCents: null, createdAt: NOW }]} side="stationery" />);
    expect(screen.getByText("Você abriu a lista")).toBeInTheDocument();
  });
});

describe("escolha de papelaria e consentimento", () => {
  const option = (over: Partial<QuoteOptionView> = {}): QuoteOptionView => ({
    id: ID, slug: "p", name: "Papelaria Demo", neighborhood: "Centro", offersPickup: true, offersDelivery: false, paymentMethods: ["pix", "credit_card"],
    isDemo: true, candidates: [], estimate: estimateFromCatalog([], [], NOW), ...over,
  });
  it("cartão sem preço diz indisponível e não inventa distância, prazo, nota nem selo", () => {
    render(<ul><StationeryCard option={option()} selectHref="/x" /></ul>);
    const card = screen.getByTestId("stationery-card");
    expect(within(card).getByTestId("stationery-estimate")).toHaveTextContent("indisponível");
    expect(card.textContent).not.toMatch(/km|nota|Parceira|Parcelado|Kit montado|prazo/i);
    expect(within(card).getByText("Demonstração")).toBeInTheDocument();
    expect(within(card).getByText(/Pix, Cartão de crédito/)).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: /Pedir pelo WhatsApp/ })).toHaveAttribute("href", "/x");
  });
  it("consentimento: checkbox desmarcado, botão desabilitado até aceitar, ids e chave no form", () => {
    render(<ConsentForm action={vi.fn()} cartId={ID} stationeryId={ID} stationeryName="Papelaria Demo" neighborhood="Centro" idempotencyKey="77777777-7777-4777-8777-777777777777" preview={"Olá!\nCódigo: LC-XXXX"} />);
    const box = screen.getByRole("checkbox");
    const submit = screen.getByRole("button", { name: "Confirmar pedido de cotação" });
    expect(box).not.toBeChecked();
    expect(submit).toBeDisabled();
    expect(screen.getByTestId("message-preview")).toHaveTextContent("Código: LC-XXXX");
    expect(screen.getByText(/bairro informado/)).toBeInTheDocument();
    fireEvent.click(box);
    expect(submit).toBeEnabled();
    const form = screen.getByRole("form");
    expect((form.querySelector('input[name="idempotencyKey"]') as HTMLInputElement).value).toBe("77777777-7777-4777-8777-777777777777");
    expect(form.querySelector('input[name="consent"]')).not.toBeNull();
  });
});
