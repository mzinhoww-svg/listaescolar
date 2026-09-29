import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LeadNextStep } from "@/components/leads/LeadNextStep";
import { WhatsAppShareButton } from "@/components/share/WhatsAppShareButton";
import { CartsSection } from "@/components/cart/CartsSection";
import { SavedListsSection } from "@/components/saved-lists/SavedListsSection";
import { StudentsSection } from "@/components/students/StudentsSection";
import { LEAD_STATUSES } from "@/features/leads/state";
import { leadNextStep } from "@/features/leads/next-step";
import { buildListShareMessage, whatsappShareUrl } from "@/features/short-links/share-message";

const input = { schoolName: "Escola Modelo", gradeLabel: "5º ano", year: 2027, link: "https://listacerta.example/l/abc" };

describe("mensagem de compartilhamento no WhatsApp", () => {
  it("contém só escola, série, ano e link", () => {
    const text = buildListShareMessage(input);
    expect(text).toContain("Escola Modelo");
    expect(text).toContain("5º ano");
    expect(text).toContain("2027");
    expect(text).toContain(input.link);
  });

  it("usa wa.me com o texto codificado", () => {
    const url = whatsappShareUrl(buildListShareMessage(input));
    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
    expect(decodeURIComponent(url.slice("https://wa.me/?text=".length))).toBe(buildListShareMessage(input));
  });

  it("nunca leva apelido de aluno (a função nem recebe esse dado)", () => {
    const text = buildListShareMessage({ ...input, nickname: "Joaninha" } as typeof input);
    expect(text).not.toContain("Joaninha");
  });

  it("o botão é um link de um toque com alvo de 44 px", () => {
    render(<WhatsAppShareButton {...input} />);
    const a = screen.getByRole("link", { name: /Compartilhar no WhatsApp/ });
    expect(a.getAttribute("href")).toBe(whatsappShareUrl(buildListShareMessage(input)));
    expect(a.getAttribute("rel")).toContain("noopener");
  });
});

describe("próximo passo da cotação", () => {
  it.each(LEAD_STATUSES)("%s tem título, texto e nenhum prazo prometido", (status) => {
    const s = leadNextStep(status);
    expect(s.title.length).toBeGreaterThan(3);
    expect(s.body.length).toBeGreaterThan(10);
    expect(`${s.title} ${s.body}`).not.toMatch(/\d+\s*(min|hora|dia)/i);
  });

  it("renderiza como status", () => {
    render(<LeadNextStep status="received" />);
    expect(screen.getByRole("status")).toHaveTextContent(leadNextStep("received").title);
  });
});

describe("vazios da conta convidam à ação", () => {
  it("sem aluno: onboarding com apelido e link de cadastro", () => {
    render(<StudentsSection students={[]} />);
    expect(screen.getByText(/apelido/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Adicionar aluno/ })).toHaveAttribute("href", "/conta/alunos/novo");
  });

  it("sem lista salva e sem carrinho: uma ação em cada", () => {
    render(
      <>
        <SavedListsSection savedLists={[]} />
        <CartsSection carts={[]} />
      </>,
    );
    const links = screen.getAllByRole("link", { name: /Buscar a escola/ });
    expect(links).toHaveLength(2);
    for (const a of links) expect(a).toHaveAttribute("href", "/escolas");
  });
});
