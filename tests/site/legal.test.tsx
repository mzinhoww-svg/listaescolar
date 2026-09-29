import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LEGAL } from "@/features/site/legal";

import { loadPage, renderInSite } from "./helpers";

/** Só o humano/jurídico preenche estes (razão social, CNPJ, contato, base legal, operadores, data, prazo de
 * auditoria — nenhuma rotina de exclusão criada para `audit_log`, que é imutável por desenho). */
const STILL_HUMAN_OWNED = ["companyName", "cnpj", "dpoEmail", "contactEmail", "auditRetention", "legalBasis", "operators", "analyticsOperator", "lastUpdated"] as const;
/** S17 preencheu com o prazo técnico das próprias regras (retention_policies, migration 0605); ver ledger "S17". */
const FILLED_BY_S17 = ["retention", "claimRetention"] as const;

describe("textos jurídicos preliminares", () => {
  it("só o humano/jurídico preenche razão social, CNPJ, contato, base legal, operadores, data e prazo de auditoria; S17 preencheu os prazos técnicos que já existem em código", () => {
    for (const k of STILL_HUMAN_OWNED) expect(LEGAL[k], k).toBeNull();
    for (const k of FILLED_BY_S17) expect(LEGAL[k], k).not.toBeNull();
    expect(Object.keys(LEGAL).sort()).toEqual([...STILL_HUMAN_OWNED, ...FILLED_BY_S17].sort());
  });

  it.each([
    ["/termos", ["data da última atualização", "e-mail do encarregado de dados"]],
    ["/privacidade", ["razão social", "CNPJ", "prazo de guarda da trilha de auditoria", "base legal", "operadores e contratos", "operador da medição de uso (PostHog)", "data da última atualização", "e-mail do encarregado de dados"]],
  ] as const)("%s: faixa preliminar e cada placeholder ainda pendente em <mark>", async (route, labels) => {
    const Page = await loadPage(route);
    const { container } = await renderInSite(Page);
    expect(screen.getByText(/Versão preliminar\. Texto em revisão jurídica\./)).toBeInTheDocument();
    const marks = [...container.querySelectorAll("mark")].map((m) => m.textContent);
    for (const l of labels) expect(marks).toContain(`[a definir: ${l}]`);
  });

  it("/privacidade: prazo de retenção e prazo de guarda dos documentos de reivindicação já preenchidos (S17), fora de <mark>", async () => {
    const Page = await loadPage("/privacidade");
    const { container } = await renderInSite(Page);
    const marks = [...container.querySelectorAll("mark")].map((m) => m.textContent);
    expect(marks).not.toContain("[a definir: prazo de retenção]");
    expect(marks).not.toContain("[a definir: prazo de guarda dos documentos de reivindicação]");
    const t = container.textContent ?? "";
    expect(t).toMatch(/excluir sua conta/i);
    expect(t).toMatch(/prazo técnico definido internamente/i);
  });

  it("privacidade: apelido e série; sem nome do aluno, sobrenome nem exclusão em Minha conta", async () => {
    const Page = await loadPage("/privacidade");
    const { container } = await renderInSite(Page);
    const t = container.textContent ?? "";
    expect(t).toMatch(/apelido e série/i);
    expect(t).not.toMatch(/nome do aluno|sobrenome|Minha conta/i);
    expect(t).toMatch(/e-mail ou conta Google/i);
  });

  it("privacidade: categorias reais e operadores, sem dado que não coletamos", async () => {
    const Page = await loadPage("/privacidade");
    const { container } = await renderInSite(Page);
    const t = container.textContent ?? "";
    for (const w of [/Supabase/, /Vercel/, /OpenRouter/, /arquivo da lista/i, /cliques em links de loja/i, /Pedidos de cotação/i, /consentimento/i, /carrinhos/i, /Reivindicação de escola/, /cargo, e-mail de contato e nota/, /o arquivo e o hash/, /versão do texto e data/, /Papelarias credenciadas: CNPJ, razão social, endereço, telefone, WhatsApp e e-mail/, /número do responsável fica visível para a papelaria/, /hash do endereço de IP/]) expect(t).toMatch(w);
    expect(t).not.toMatch(/\bcidade\b/i);
  });

  it("última atualização no topo e cartão Dúvidas no fim", async () => {
    const Page = await loadPage("/termos");
    const { container } = await renderInSite(Page);
    const main = container.querySelector("main")!;
    const upd = [...main.querySelectorAll("p")].find((p) => p.textContent?.startsWith("Última atualização"));
    expect(upd).toBeTruthy();
    expect(main.querySelector("h1")!.compareDocumentPosition(upd!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(main.lastElementChild?.tagName).toBe("ASIDE");
    expect(main.lastElementChild?.textContent).toMatch(/^Dúvidas:/);
  });

  it("termos: compra na loja escolhida e comissão sem mudar o preço", async () => {
    const Page = await loadPage("/termos");
    const { container } = await renderInSite(Page);
    const t = container.textContent ?? "";
    expect(t).toMatch(/A compra acontece na loja escolhida, com as regras dela/);
    expect(t).toMatch(/podemos receber comissão das lojas; o preço não muda/i);
  });
});

describe("/privacidade: medição de uso (ADR-007, S28)", () => {
  it("descreve a medição sem afirmar conformidade e sem prometer o que não há", async () => {
    const Page = await loadPage("/privacidade");
    const { container } = await renderInSite(Page);
    const t = container.textContent ?? "";
    expect(t).toMatch(/Medição de uso/);
    expect(t).toMatch(/Antes da sua escolha nada é enviado/);
    expect(t).toMatch(/não levam nome, e-mail, telefone, texto digitado nem dado de estudante/);
    expect(t).not.toMatch(/em conformidade com a LGPD/i);
    expect(t).not.toMatch(/\bconforme (a )?LGPD\b/i);
    const marks = [...container.querySelectorAll("mark")].map((m) => m.textContent);
    expect(marks).toContain("[a definir: operador da medição de uso (PostHog)]");
  });

  it("/privacidade: medição de uso diz com precisão o que depende do aceite e o que não depende, sem afirmar conformidade", async () => {
    const Page = await loadPage("/privacidade");
    const { container } = await renderInSite(Page);
    const t = container.textContent ?? "";
    expect(t).toMatch(/cookie que diz apenas "aceito", sem identificador/);
    expect(t).toMatch(/não registram o seu login nem o seu clique de compra/);
    expect(t).toMatch(/Independentemente da sua escolha, nossos servidores registram fatos do funcionamento do serviço/);
    expect(t).toMatch(/agregados/);
    expect(t).not.toMatch(/em conformidade|compatível com a LGPD|totalmente anônim/i);
  });
});
