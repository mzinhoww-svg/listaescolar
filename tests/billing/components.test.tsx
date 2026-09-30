import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BalanceCard } from "@/components/billing/BalanceCard";
import { InvoiceList } from "@/components/billing/InvoiceList";
import { PackageCards } from "@/components/billing/PackageCards";
import { PassCard } from "@/components/billing/PassCard";
import { PriceTierTable } from "@/components/billing/PriceTierTable";
import { StatementTable } from "@/components/billing/StatementTable";
import type { ActivePlan, InvoiceView, WalletSummary } from "@/features/billing/ports";
import { seasonWindow } from "@/features/billing/season";

const PLAN: ActivePlan = {
  id: "p1",
  version: 1,
  freeLeads: 2,
  freeLeadsValidityDays: 90,
  seasonStartMonth: 11,
  seasonEndMonth: 3,
  tiers: [
    { minItems: 1, maxItems: 20, priceCents: 500 },
    { minItems: 21, maxItems: null, priceCents: 900 },
  ],
  packages: [{ id: "k1", amountCents: 5000 }, { id: "k2", amountCents: 10000 }],
  pass: { priceCents: 30000, includedLeads: 40, maxInstallments: 3 },
};

const SUMMARY: WalletSummary = {
  available: true,
  balanceCents: 4100,
  freeGranted: 2,
  freeLeft: 1,
  freeExpiresAt: new Date("2026-12-31T00:00:00Z"),
  planVersion: 1,
  activePass: null,
  canReceiveMinTier: true,
  minTierPriceCents: 500,
};

describe("BalanceCard", () => {
  it("mostra o saldo em reais e o selo de demonstração quando is_demo", () => {
    render(<BalanceCard summary={SUMMARY} weeklyAverage={2.5} isDemo={true} />);
    expect(screen.getByTestId("balance-amount")).toHaveTextContent("R$");
    expect(screen.getByTestId("balance-amount")).toHaveTextContent("41,00");
    expect(screen.getByText("Demonstração")).toBeInTheDocument();
  });

  it("consumo médio indisponível vira o texto 'indisponível', nunca um zero inventado", () => {
    render(<BalanceCard summary={SUMMARY} weeklyAverage={null} isDemo={false} />);
    expect(screen.getByText("indisponível")).toBeInTheDocument();
  });

  it("sem plano ativo: 'Planos indisponíveis no momento'", () => {
    render(<BalanceCard summary={{ available: false }} weeklyAverage={null} isDemo={false} />);
    expect(screen.getByText("Planos indisponíveis no momento")).toBeInTheDocument();
  });
});

describe("PriceTierTable", () => {
  it("lista as faixas do plano, sem 'R$ por lead' inventado", () => {
    render(<PriceTierTable tiers={PLAN.tiers} />);
    expect(screen.getByText("1 a 20 itens")).toBeInTheDocument();
    expect(screen.getByText("a partir de 21 itens")).toBeInTheDocument();
    expect(screen.queryByText(/R\$.*por lead/i)).not.toBeInTheDocument();
  });
});

describe("PackageCards", () => {
  it("sem provedor disponível: botões desabilitados e aviso", () => {
    render(<PackageCards plan={PLAN} packages={PLAN.packages} stationeryId="s1" paymentAvailable={false} isDemo={false} idempotencyKeys={{ k1: "k1-key", k2: "k2-key" }} />);
    expect(screen.getByText("Pagamento via Pix indisponível no momento.")).toBeInTheDocument();
    for (const btn of screen.getAllByRole("button")) expect(btn).toBeDisabled();
    expect(screen.queryByText(/mais usado/i)).not.toBeInTheDocument();
  });

  it("carteira demo: botão diz 'Comprar (demonstração)'", () => {
    render(<PackageCards plan={PLAN} packages={PLAN.packages} stationeryId="s1" paymentAvailable={true} isDemo={true} idempotencyKeys={{ k1: "k1-key", k2: "k2-key" }} />);
    expect(screen.getAllByRole("button", { name: "Comprar (demonstração)" })).toHaveLength(2);
  });
});

describe("PassCard", () => {
  const now = new Date("2026-11-05T12:00:00-04:00");
  const season = seasonWindow({ seasonStartMonth: 11, seasonEndMonth: 3 }, now);

  it("mostra os meses da temporada e os leads incluídos, sem 'destaque' nem 'relatório semanal'", () => {
    render(<PassCard plan={PLAN} pass={PLAN.pass!} season={season} stationeryId="s1" paymentAvailable={true} isDemo={false} maxInstallments={3} now={now} idempotencyKey="pass-key" />);
    expect(screen.getByText(/40 leads incluídos/)).toBeInTheDocument();
    expect(screen.queryByText(/destaque/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/relatório semanal/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Assinar o passe" })).toBeInTheDocument();
  });

  it("sem parcelas disponíveis (compra perto do fim da temporada): mensagem, sem formulário", () => {
    render(<PassCard plan={PLAN} pass={PLAN.pass!} season={season} stationeryId="s1" paymentAvailable={true} isDemo={false} maxInstallments={null} now={now} idempotencyKey="pass-key" />);
    expect(screen.queryByRole("button", { name: "Assinar o passe" })).not.toBeInTheDocument();
    expect(screen.getByText(/não é possível assinar o passe agora/i)).toBeInTheDocument();
  });
});

describe("StatementTable", () => {
  it("vazio: 'Nenhum lançamento ainda'", () => {
    render(<StatementTable lines={[]} />);
    expect(screen.getByText("Nenhum lançamento ainda")).toBeInTheDocument();
  });

  it("mostra valor e saldo após cada lançamento", () => {
    render(<StatementTable lines={[{ id: "e1", date: new Date(), description: "Lead LC-AAAA · Escola X", amountCents: -500, balanceAfterCents: 4500 }]} />);
    expect(screen.getByText("Lead LC-AAAA · Escola X")).toBeInTheDocument();
  });
});

describe("InvoiceList", () => {
  const inv: InvoiceView = {
    id: "inv-1",
    kind: "credit_package",
    seasonPassId: null,
    installmentNo: null,
    amountCents: 5000,
    dueDate: "2026-06-10",
    status: "open",
    provider: "demo",
    isDemo: true,
    providerChargeId: null,
    pixCopyPaste: null,
    chargeExpiresAt: null,
    paidAt: null,
    paidAmountCents: null,
    createdAt: new Date(),
  };

  it("vazio: 'Nenhuma fatura ainda'", () => {
    render(<InvoiceList invoices={[]} />);
    expect(screen.getByText("Nenhuma fatura ainda")).toBeInTheDocument();
  });

  it("lista a fatura com link para o detalhe", () => {
    render(<InvoiceList invoices={[inv]} />);
    const link = screen.getByRole("link", { name: "Ver" });
    expect(link).toHaveAttribute("href", "/papelaria/creditos/faturas/inv-1");
    expect(link.className).toContain("min-h-11"); // alvo de 44 px (era 22 x 20)
  });
});
