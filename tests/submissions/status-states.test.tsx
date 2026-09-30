// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/enviar-lista/[submissionId]/actions", () => ({ setNotifyAction: vi.fn() }));

import { AsyncOptions } from "@/components/submissions/AsyncOptions";
import { ReviewSummary } from "@/components/submissions/ReviewSummary";
import { StatusNotice } from "@/components/submissions/StatusNotice";
import { slugForSeriesValue } from "@/components/submissions/series-options";

const ID = "5b1d4c2e-7d1a-4f0e-9a52-0c3f5e9a1b11";
const result = { items: [{ name: "Caderno", quantity: 2, unit: "un", confidence: 0.9 }], overallConfidence: 0.9, warnings: [] };
const hrefs = () => screen.getAllByRole("link").map((a) => [a.textContent, a.getAttribute("href")]);

describe("UX-062 · estados finais dizem se o envio valeu e dão saída", () => {
  it("indisponível: o envio valeu, não precisa reenviar; principal 'Ver meus envios', com saída para a conta", () => {
    render(<StatusNotice kind="unavailable" />);
    expect(screen.getByRole("main")).toHaveTextContent(/foi recebido/);
    expect(screen.getByRole("main")).toHaveTextContent(/não precisa enviar de novo/i);
    expect(screen.queryByText(/tente enviar de novo/i)).not.toBeInTheDocument();
    expect(hrefs()).toContainEqual(["Ver meus envios", "/conta/envios"]);
    expect(hrefs()).toContainEqual(["Ir para minha conta", "/conta"]);
    expect(screen.getAllByRole("link").filter((a) => a.className.includes("bg-tinta")).map((a) => a.textContent)).toEqual(["Ver meus envios"]);
  });

  it("falhou: diz que este envio não valeu e oferece enviar outro arquivo", () => {
    render(<StatusNotice kind="failed" />);
    expect(screen.getByRole("main")).toHaveTextContent(/não vale como lista/);
    expect(hrefs()).toContainEqual(["Enviar outro arquivo", "/enviar-lista"]);
    expect(hrefs()).toContainEqual(["Ir para minha conta", "/conta"]);
  });

  it("perdeu a conexão: 'Recarregar' é a principal e o envio continua em Meus envios", () => {
    render(<StatusNotice kind="lost" />);
    expect(screen.getByRole("button", { name: "Recarregar a página" })).toBeInTheDocument();
    expect(hrefs()).toContainEqual(["Ver meus envios", "/conta/envios"]);
  });

  it("lida: diz que o envio valeu, sem reenviar; saídas para meus envios e conta", () => {
    render(<ReviewSummary isDemo={false} status="review_needed" result={result} submissionId={ID} source="parent" />);
    expect(screen.getByText(/Seu envio foi recebido\. Não é preciso enviar de novo/)).toBeInTheDocument();
    expect(hrefs()).toContainEqual(["Revisar meus itens", `/enviar-lista/${ID}/revisar`]);
    expect(hrefs()).toContainEqual(["Meus envios", "/conta/envios"]);
    expect(hrefs()).toContainEqual(["Ir para minha conta", "/conta"]);
    expect(hrefs()).toContainEqual(["Enviar outra lista", "/enviar-lista"]);
  });

  it("uma só ação principal por estado", () => {
    render(<ReviewSummary isDemo={false} status="review_needed" result={result} submissionId={ID} source="parent" />);
    expect(screen.getAllByRole("link").filter((a) => a.className.includes("bg-tinta")).map((a) => a.textContent)).toEqual(["Revisar meus itens"]);
  });
});

describe("UX-068 · lista publicada leva à lista e não repete o título", () => {
  it("publicada com endereço: principal 'Ver a lista publicada'; título e corpo diferentes", () => {
    render(<ReviewSummary isDemo={false} status="published" result={result} submissionId={ID} source="parent" listHref="/escolas/51000001/ef-5?ano=2027" />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent("Lista publicada");
    const body = screen.getByTestId("publication-state");
    expect(body.textContent).not.toMatch(/Lista publicada/);
    expect(body).toHaveTextContent("Ela já aparece para outras famílias.");
    expect(hrefs()).toContainEqual(["Ver a lista publicada", "/escolas/51000001/ef-5?ano=2027"]);
    expect(screen.getAllByRole("link").filter((a) => a.className.includes("bg-tinta")).map((a) => a.textContent)).toEqual(["Ver a lista publicada"]);
    expect(hrefs()).toContainEqual(["Revisar meus itens", `/enviar-lista/${ID}/revisar`]);
  });

  it("publicada sem endereço da lista: não inventa link", () => {
    render(<ReviewSummary isDemo={false} status="published" result={result} submissionId={ID} source="parent" />);
    expect(screen.queryByRole("link", { name: "Ver a lista publicada" })).not.toBeInTheDocument();
  });

  it("slugForSeriesValue é o inverso de seriesValueForSlug", () => {
    expect(slugForSeriesValue("5º ano")).toBe("ef-5");
    expect(slugForSeriesValue("2ª série do ensino médio")).toBe("em-2");
    expect(slugForSeriesValue("Educação infantil")).toBeUndefined();
    expect(slugForSeriesValue("qualquer")).toBeUndefined();
  });
});

describe("J4-12 · sem resultado da leitura não diz 'nenhum item'", () => {
  it("resultado ausente: 'indisponível', não 'Nenhum item foi identificado'", () => {
    render(<ReviewSummary isDemo status="human_review" submissionId={ID} source="parent" />);
    expect(screen.queryByText(/Nenhum item foi identificado/)).not.toBeInTheDocument();
    expect(screen.getByText(/itens desta leitura não estão disponíveis/i)).toBeInTheDocument();
  });
});

describe("UX-066 · não promete aviso onde o canal está indisponível", () => {
  it("explica que o resultado fica em Meus envios e liga a ele", () => {
    render(<AsyncOptions submissionId={ID} />);
    expect(screen.getByRole("link", { name: "Ver meus envios" })).toHaveAttribute("href", "/conta/envios");
    expect(screen.getByText(/resultado fica em Meus envios/)).toBeInTheDocument();
    expect(document.body.innerHTML).not.toMatch(/#ffb4a8/i);
  });
  it("nenhum texto promete 'vamos avisar' nem 'será ativado'", () => {
    const { container } = render(<AsyncOptions submissionId={ID} />);
    expect(container.textContent).not.toMatch(/vamos avisar|ainda será ativado/i);
    void within;
  });
});

import { statusPayloadSchema } from "@/features/submissions/status-model";

describe("listHref do andamento", () => {
  const base = { status: "published", jobStatus: null, attempts: 0, notifyChannel: null, isDemo: false, pipelineAvailable: true };
  it("aceita só o endereço de lista publicada da escola", () => {
    expect(statusPayloadSchema.safeParse({ ...base, listHref: "/escolas/51000001/ef-5?ano=2027" }).success).toBe(true);
    expect(statusPayloadSchema.safeParse({ ...base, listHref: "https://x.test/escolas/51000001/ef-5" }).success).toBe(false);
    expect(statusPayloadSchema.safeParse({ ...base, listHref: "//evil.test" }).success).toBe(false);
  });
});
