import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DecisionForm } from "@/app/admin/parceiros/[id]/DecisionForm";
import { PARTNER_LIVE_RATE_PER_DAY, PARTNER_LIVE_RATE_PER_MINUTE, PARTNER_TEST_RATE_PER_DAY, PARTNER_TEST_RATE_PER_MINUTE } from "@/features/b2b/limits";

// Revisão de segurança da Task 3 (Important #2) e revisão final do branch S24 (Important #1 e #2): suspender,
// recusar e QUALQUER transição que revogue chave (`keysRevokedOnTransition`, ex.: `active -> sandbox`) exigem
// confirmação de fato; nada vem pré-selecionado; os valores atuais do parceiro (plano/cobertura/limites) viram o
// padrão do formulário, nunca um valor genérico, quando eles já existem.

describe("DecisionForm — nada pré-selecionado", () => {
  it("ao abrir, nenhum rádio vem marcado e o botão fica desabilitado", () => {
    render(<DecisionForm partnerId="p1" status="active" action={vi.fn()} />);
    for (const radio of screen.getAllByRole("radio")) expect(radio).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Escolha uma decisão" })).toBeDisabled();
  });
});

describe("DecisionForm — confirmação para toda transição que revoga chave", () => {
  it("suspender: o botão principal abre a confirmação; a action só roda depois de confirmar", () => {
    const action = vi.fn();
    render(<DecisionForm partnerId="p1" status="active" action={action} />);
    fireEvent.click(screen.getByLabelText("Suspender"));
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "teste de suspensão" } });
    fireEvent.click(screen.getByRole("button", { name: "Suspender" }));
    expect(action).not.toHaveBeenCalled();
    expect(screen.getByText(/revoga as chaves na hora/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Suspender agora" }));
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("recusar: mesma confirmação, com o texto de recusa", () => {
    const action = vi.fn();
    render(<DecisionForm partnerId="p1" status="pending" action={action} />);
    fireEvent.click(screen.getByLabelText("Recusar"));
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "CNPJ não confere" } });
    fireEvent.click(screen.getByRole("button", { name: "Recusar" }));
    expect(action).not.toHaveBeenCalled();
    expect(screen.getByText(/definitivo para esta solicitação/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Recusar agora" }));
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("rebaixar active -> sandbox (revoga as chaves live): exige confirmação, achado da revisão final", () => {
    const action = vi.fn();
    // `plan="regional"`: um parceiro `active` de verdade já tem plano (Finding #2 já preenche o campo); sem isso
    // o `reportValidity()` do Plano (obrigatório) bloquearia a abertura do diálogo antes mesmo de chegar aqui.
    render(<DecisionForm partnerId="p1" status="active" action={action} plan="regional" />);
    fireEvent.click(screen.getByLabelText("Rebaixar para sandbox"));
    fireEvent.click(screen.getByRole("button", { name: "Rebaixar para sandbox" }));
    expect(action).not.toHaveBeenCalled();
    expect(screen.getByText(/chaves de produção/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Rebaixar agora" }));
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("aprovar (sem confirmação): o clique no botão principal já envia, sem diálogo", () => {
    const action = vi.fn();
    render(<DecisionForm partnerId="p1" status="pending" action={action} />);
    fireEvent.click(screen.getByLabelText("Aprovar em sandbox"));
    fireEvent.change(screen.getByLabelText("Plano"), { target: { value: "regional" } });
    fireEvent.click(screen.getByRole("button", { name: "Aprovar em sandbox" }));
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("cancelar na confirmação não envia nada", () => {
    const action = vi.fn();
    render(<DecisionForm partnerId="p1" status="active" action={action} />);
    fireEvent.click(screen.getByLabelText("Suspender"));
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "teste" } });
    fireEvent.click(screen.getByRole("button", { name: "Suspender" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(action).not.toHaveBeenCalled();
  });
});

describe("DecisionForm — padrões de campo", () => {
  it("aprovar sem editar os campos de limite: os valores enviados são o padrão de negócio, nunca o mínimo (1)", () => {
    const action = vi.fn();
    render(<DecisionForm partnerId="p1" status="pending" action={action} />);
    fireEvent.click(screen.getByLabelText("Aprovar em produção"));
    fireEvent.change(screen.getByLabelText("Plano"), { target: { value: "regional" } });
    fireEvent.click(screen.getByRole("button", { name: "Aprovar em produção" }));
    expect(action).toHaveBeenCalledTimes(1);
    const sent = action.mock.calls[0]![0] as FormData;
    expect(sent.get("testRatePerMinute")).toBe(String(PARTNER_TEST_RATE_PER_MINUTE.default));
    expect(sent.get("testRatePerDay")).toBe(String(PARTNER_TEST_RATE_PER_DAY.default));
    expect(sent.get("liveRatePerMinute")).toBe(String(PARTNER_LIVE_RATE_PER_MINUTE.default));
    expect(sent.get("liveRatePerDay")).toBe(String(PARTNER_LIVE_RATE_PER_DAY.default));
    for (const field of ["testRatePerMinute", "testRatePerDay", "liveRatePerMinute", "liveRatePerDay"]) {
      expect(sent.get(field)).not.toBe("1");
    }
  });

  it("promover sem editar nada: os valores ATUAIS do parceiro aparecem como padrão, não o genérico nem nacional", () => {
    // Achado da revisão final (Important #2): aprovar/promover sem editar não pode resetar cobertura para
    // nacional nem os limites para o padrão de negócio quando o parceiro já tinha valores próprios.
    const action = vi.fn();
    render(
      <DecisionForm
        partnerId="p1"
        status="sandbox"
        action={action}
        plan="regional"
        coverageUfs={["MT", "GO"]}
        limits={{ testRatePerMinute: 5, testRatePerDay: 2000, liveRatePerMinute: null, liveRatePerDay: null }}
      />,
    );
    fireEvent.click(screen.getByLabelText("Aprovar em produção"));
    expect(screen.getByLabelText("Plano")).toHaveValue("regional");
    expect(screen.getByLabelText("Nacional")).not.toBeChecked();
    expect(screen.getByLabelText("MT")).toBeChecked();
    expect(screen.getByLabelText("GO")).toBeChecked();
    expect(screen.getByLabelText("Sandbox · por minuto")).toHaveValue(5);
    expect(screen.getByLabelText("Sandbox · por dia")).toHaveValue(2000);
    // live nunca foi definido (parceiro nunca esteve em produção): cai no padrão de negócio, não em "1".
    expect(screen.getByLabelText("Produção · por minuto")).toHaveValue(PARTNER_LIVE_RATE_PER_MINUTE.default);
    expect(screen.getByLabelText("Produção · por dia")).toHaveValue(PARTNER_LIVE_RATE_PER_DAY.default);
  });

  it("parceiro sem cobertura nem plano definidos ainda (nunca decidido): cai no padrão nacional e no placeholder do plano", () => {
    render(<DecisionForm partnerId="p1" status="pending" action={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Aprovar em sandbox"));
    expect(screen.getByLabelText("Nacional")).toBeChecked();
    expect(screen.getByLabelText("Plano")).toHaveValue("");
  });
});
