import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TelaFinalSucesso } from "@/components/pesquisa/TelaFinalSucesso";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";

describe("TelaFinalSucesso", () => {
  it("monta o link wa.me com a mensagem exata da spec (seção 4) e g='indicacao' quando g está ausente", () => {
    render(<TelaFinalSucesso sessionId={SESSION_ID} />);
    const link = screen.getByRole("link", { name: "Enviar para outra mãe" });
    const href = link.getAttribute("href") ?? "";
    expect(href.startsWith("https://wa.me/?text=")).toBe(true);

    const mensagem = decodeURIComponent(href.replace("https://wa.me/?text=", ""));
    expect(mensagem).toBe(
      "Estou respondendo uma pesquisa rápida sobre a compra da lista de material escolar. " +
        `Leva 3 minutos: ${window.location.origin}/pesquisa?ref=${SESSION_ID}&g=indicacao`,
    );
  });

  it("usa o g atual da sessão quando presente, em vez de 'indicacao'", () => {
    render(<TelaFinalSucesso sessionId={SESSION_ID} g="grupo-maes-1" />);
    const href =
      screen.getByRole("link", { name: "Enviar para outra mãe" }).getAttribute("href") ?? "";
    const mensagem = decodeURIComponent(href.replace("https://wa.me/?text=", ""));
    expect(mensagem).toContain(`g=grupo-maes-1`);
    expect(mensagem).not.toContain("indicacao");
  });

  it("a mensagem nunca contém nome, telefone ou dado de escola — só o pitch genérico e a URL", () => {
    render(<TelaFinalSucesso sessionId={SESSION_ID} g="e2e-teste" />);
    const href =
      screen.getByRole("link", { name: "Enviar para outra mãe" }).getAttribute("href") ?? "";
    const mensagem = decodeURIComponent(href.replace("https://wa.me/?text=", ""));
    expect(mensagem).not.toMatch(/\d{2}\s?9\d{8}/); // formato de telefone BR
    expect(mensagem).toBe(
      "Estou respondendo uma pesquisa rápida sobre a compra da lista de material escolar. " +
        `Leva 3 minutos: ${window.location.origin}/pesquisa?ref=${SESSION_ID}&g=e2e-teste`,
    ); // só o texto fixo + a URL com ref/g, nada de nome/escola/telefone
  });
});
