// S29 T12 · J2/J6: `/conta/compras` (UX-025, UX-026, UX-027).
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/auth/guard", () => ({ requireAccess: vi.fn(async () => ({ user: { id: "u" }, role: "parent" })) }));
vi.mock("@/features/auth/actor", () => ({ getSessionActor: async () => ({ userId: "u", role: "parent" }) }));
vi.mock("@/features/stationeries/actor", () => ({ getSessionActor: async () => ({ userId: "u", role: "parent" }) }));
const listSurveyLeadsForParent = vi.fn();
vi.mock("@/features/conversion/wiring", () => ({ getConversionService: () => ({ listSurveyLeadsForParent }) }));
vi.mock("@/features/conversion/actions", () => ({ confirmPurchaseAction: vi.fn(), createReviewAction: vi.fn() }));

import ComprasPage from "@/app/conta/compras/page";
import { PurchaseCard } from "@/app/conta/compras/PurchaseCard";
import { MIN_HOURS_BEFORE_SURVEY, surveyAskable } from "@/features/conversion/survey";
import type { SurveyLeadView } from "@/features/conversion/ports";
import { errorMessageForCode } from "@/features/conversion/messages";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});

const NOW = new Date("2026-09-30T12:00:00Z");
const ID = "11111111-1111-4111-8111-111111111111";
const item = (over: Partial<SurveyLeadView> = {}): SurveyLeadView => ({
  leadId: ID, code: "LC-5TJ1", stationeryId: ID, stationeryName: "Papelaria Demo", schoolName: "Escola Demo", status: "quote_sent",
  createdAt: new Date("2026-09-29T12:00:00Z"), existingAnswer: null, canReview: false, alreadyReviewed: false, ...over,
});
const card = (v: SurveyLeadView, confirm = vi.fn(), review = vi.fn()) => render(<PurchaseCard item={v} confirmPurchase={confirm} createReview={review} now={NOW} />);

beforeEach(() => listSurveyLeadsForParent.mockReset());

describe("UX-025 · a página tem cabeçalho e volta", () => {
  it("título e 'Voltar' para /conta", async () => {
    listSurveyLeadsForParent.mockResolvedValue([]);
    render(await ComprasPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("link", { name: "Voltar" })).toHaveAttribute("href", "/conta");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Suas compras");
    expect(screen.getByText(/Nenhum pedido de cotação ainda/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver suas cotações" })).toHaveAttribute("href", "/cotacao");
  });
});

describe("UX-026 · 'Comprei aqui' explica o efeito e pede confirmação", () => {
  it("o botão só abre o diálogo; o envio fica no diálogo, com o efeito escrito", () => {
    const { container } = card(item());
    const dialog = container.querySelector("dialog")!;
    expect(dialog.textContent).toMatch(/a papelaria pode ser cobrada/);
    expect(dialog.textContent).toMatch(/Ainda não/);
    expect(dialog.querySelector('input[name="answer"][value="bought_here"]')).not.toBeNull();
    expect(container.querySelectorAll('input[name="answer"][value="bought_here"]')).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Comprei aqui" }));
    expect(dialog.hasAttribute("open")).toBe(true);
    expect(within(dialog).getByRole("button", { name: "Confirmar: comprei aqui", hidden: true })).toHaveAttribute("type", "submit");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar", hidden: true }));
    expect(dialog.hasAttribute("open")).toBe(false);
  });

  it("respondida, oferece corrigir a resposta", () => {
    card(item({ existingAnswer: "bought_here" }));
    expect(screen.getByText("Você disse: comprei aqui")).toBeInTheDocument();
    expect(screen.getByText("Corrigir resposta")).toBeInTheDocument();
  });

  it("mais de um cartão não repete o id do título do diálogo", () => {
    const { container } = render(
      <>
        <PurchaseCard item={item()} confirmPurchase={vi.fn()} createReview={vi.fn()} now={NOW} />
        <PurchaseCard item={item({ leadId: "22222222-2222-4222-8222-222222222222", code: "LC-8HN4" })} confirmPurchase={vi.fn()} createReview={vi.fn()} now={NOW} />
      </>,
    );
    const ids = [...container.querySelectorAll("dialog h2")].map((h) => h.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("UX-027 · nota sem padrão e pergunta só depois de um tempo", () => {
  it("nenhum radio marcado ao abrir e a nota é obrigatória", () => {
    const { container } = card(item({ canReview: true, existingAnswer: "bought_here" }));
    const radios = [...container.querySelectorAll<HTMLInputElement>('input[type="radio"][name="rating"]')];
    expect(radios).toHaveLength(5);
    expect(radios.some((r) => r.checked)).toBe(false);
    expect(radios.every((r) => r.required)).toBe(true);
  });

  it("nota vazia volta com mensagem própria", () => {
    expect(errorMessageForCode("rating_required")).toBe("Escolha uma nota de 1 a 5 antes de enviar a avaliação.");
  });

  it("pergunta ausente antes do tempo mínimo, e explicada", () => {
    const fresh = item({ status: "received", createdAt: new Date(NOW.getTime() - 60 * 60 * 1000) });
    expect(surveyAskable(fresh, NOW)).toBe(false);
    const { container } = card(fresh);
    expect(screen.queryByRole("button", { name: "Comprei aqui" })).toBeNull();
    expect(container.textContent).toContain(`${MIN_HOURS_BEFORE_SURVEY} horas`);
  });

  it("a papelaria ter respondido, ou passar o prazo, libera a pergunta", () => {
    expect(surveyAskable(item({ status: "quote_sent" }), NOW)).toBe(true);
    expect(surveyAskable(item({ status: "received", createdAt: new Date(NOW.getTime() - 25 * 3600 * 1000) }), NOW)).toBe(true);
    expect(surveyAskable(item({ status: "received", existingAnswer: "not_yet" }), NOW)).toBe(true);
  });
});
