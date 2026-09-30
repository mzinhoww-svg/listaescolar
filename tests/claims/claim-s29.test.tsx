import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { ClaimFlow } from "@/components/claims/ClaimFlow";
import { ClaimLayout } from "@/components/claims/ClaimLayout";
import { ClaimStepper } from "@/components/claims/ClaimStepper";
import { CreateClaimForm } from "@/components/claims/CreateClaimForm";
import { MethodPicker } from "@/components/claims/MethodPicker";
import { SchoolSummaryCard } from "@/components/claims/SchoolSummaryCard";
import { IDLE, ok, type ClaimActionState } from "@/features/claims/form-state";
import { nextStep } from "@/features/claims/next-step";
import type { ClaimStatusView } from "@/features/claims/types";

const methods = { institutional_email: { available: false, reason: "sem e-mail no INEP" }, institutional_whatsapp: { available: false, reason: "sem celular no INEP" }, documents: { available: true } } as never;
const noop = vi.fn(async (): Promise<ClaimActionState> => ok("feito"));
const view = (over: Partial<ClaimStatusView> = {}): ClaimStatusView => ({
  id: "11111111-1111-4111-8111-111111111111", schoolId: "33333333-3333-4333-8333-333333333333", method: "documents", status: "submitted", claimantName: "Ana", claimantRoleTitle: "Diretora",
  evidenceNote: null, channelConfirmedAt: null, decisionReason: null, decidedAt: null, isDemo: true, createdAt: "2026-09-10T15:00:00Z",
  events: [{ toStatus: "submitted", actorKind: "claimant", createdAt: "2026-09-10T15:00:00Z", reason: null, fromStatus: null }], evidence: [], ...over,
});

describe("UX-092 · alvos do cabeçalho do pedido", () => {
  it("a logo e a saída têm 44 px de altura", () => {
    render(<ClaimLayout inep="99001003" title="T" crumb="c"><p>x</p></ClaimLayout>);
    expect(screen.getByRole("link", { name: "ListaCerta, início" }).className).toContain("min-h-11");
    const out = screen.getByRole("link", { name: "Cancelar" });
    expect(out.className).toContain("min-h-11");
    expect(out).toHaveAttribute("href", "/escolas/99001003");
  });
  it("depois do envio a saída não diz 'Cancelar' (não cancela nada): 'Voltar ao perfil da escola'", () => {
    render(<ClaimLayout inep="99001003" title="T" crumb="c" exit="back"><p>x</p></ClaimLayout>);
    expect(screen.queryByRole("link", { name: "Cancelar" })).toBeNull();
    expect(screen.getByRole("link", { name: "Voltar ao perfil da escola" })).toHaveAttribute("href", "/escolas/99001003");
  });
});

describe("UX-095 · escola que já tem administrador", () => {
  it("sem o quadro 'Por que administrar', que contradiz o aviso", () => {
    render(<ClaimLayout inep="99001003" title="T" crumb="c" why={false}><p>x</p></ClaimLayout>);
    expect(screen.queryByText(/Por que administrar/)).toBeNull();
  });
});

describe("UX-091/101 · etapas cabem na coluna e têm nomes que dizem o que acontece", () => {
  it("três etapas em grade (sem largura mínima maior que a coluna) e nomes novos", () => {
    render(<ClaimStepper steps={["Seus dados", "Comprovação", "Análise"]} current={2} />);
    const list = screen.getByRole("list", { name: "Etapas do pedido" });
    expect(list.className).toContain("grid-cols-3");
    expect(list.className).toContain("min-w-0");
    expect(screen.getByText("Seus dados").closest("li")?.textContent).toContain("✓");
  });
  it("'Pedido iniciado' aparece uma vez e o título pede para concluir", () => {
    render(<ClaimFlow inep="99001003" claim={view()} actions={{ upload: noop, remove: noop, submit: noop, request: noop, confirm: noop }} />);
    expect(screen.getAllByText("Pedido iniciado")).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 2, name: "Conclua o pedido" })).toBeInTheDocument();
  });
});

describe("UX-099 · método: 'Documentos' primeiro; indisponíveis depois, com rádio de 24 px", () => {
  it("ordem e tamanho do rádio", () => {
    render(<fieldset><MethodPicker methods={methods} /></fieldset>);
    const radios = screen.getAllByRole("radio");
    expect(radios[0]).toHaveAttribute("value", "documents");
    expect(radios[0]).toBeChecked();
    for (const r of radios) expect(r.className).toContain("size-6");
    expect(radios[1]).toBeDisabled();
  });
});

describe("UX-097 · formulário do pedido", () => {
  it("noValidate: erro em português junto do campo, sem chamar a action, e sem o id interno do texto", () => {
    const action = vi.fn(async (): Promise<ClaimActionState> => IDLE);
    const { container } = render(<CreateClaimForm action={action} inep="99001003" methods={methods} accountEmail="a@b.com" privacyVersion="claim-v1" />);
    expect(container.querySelector("form")).toHaveAttribute("novalidate");
    expect(container.textContent).not.toContain("claim-v1");
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByText("Escreva seu nome.")).toBeInTheDocument();
    expect(screen.getByText("Escreva seu cargo na escola.")).toBeInTheDocument();
    expect(screen.getByText("Marque a caixa para continuar.")).toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Seu nome")).toHaveAttribute("aria-invalid", "true");
  });
  it("dá um exemplo em 'Seu nome'", () => {
    render(<CreateClaimForm action={vi.fn()} inep="99001003" methods={methods} accountEmail={null} privacyVersion="claim-v1" />);
    expect(screen.getByLabelText("Seu nome")).toHaveAttribute("placeholder", "Ex.: Maria da Silva");
  });
});

describe("UX-100 · vocabulário", () => {
  it("'lista oficial', não 'lista publicada', e o INEP vem explicado", () => {
    const s = nextStep("approved", true);
    expect(`${s.title} ${s.body} ${s.cta}`).not.toMatch(/publicad/);
    expect(s.cta).toBe("Ver a lista oficial");
    render(<SchoolSummaryCard school={{ id: "i", inep: "99001003", name: "Escola X", municipality: "Cuiabá", verificationStatus: "registered", isDemo: false }} />);
    expect(screen.getByText(/Código INEP 99001003 \(o número da escola no Censo Escolar\)/)).toBeInTheDocument();
  });
});
