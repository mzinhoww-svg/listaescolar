import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/auth/guard", () => ({ requireAccess: vi.fn() }));

import { SchoolStatusPanel } from "@/app/escola/envios/[submissionId]/SchoolStatusPanel";
import type { StatusPayload } from "@/features/submissions/status-model";

const ID = "5b1d4c2e-7d1a-4f0e-9a52-0c3f5e9a1b11";
const base: StatusPayload = { status: "processing_async", jobStatus: "queued", attempts: 0, notifyChannel: "none", isDemo: false, pipelineAvailable: true, source: "school" };
const result = { items: [{ name: "Caderno", quantity: 2, unit: "un", confidence: 0.9 }, { name: "Lápis", quantity: 1, unit: "un", confidence: 0.9 }], overallConfidence: 0.9, warnings: [] };

describe("UX-090 · andamento do envio da escola (dentro do painel)", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("lendo: diz quem revisa (a equipe ListaCerta) e não promete revisão da escola", () => {
    render(<SchoolStatusPanel submissionId={ID} initial={base} />);
    expect(screen.getByRole("heading", { level: 2, name: "Recebemos o arquivo da escola" })).toBeInTheDocument();
    expect(screen.getByText(/A equipe ListaCerta revisa a lista antes de ela aparecer para as famílias/)).toBeInTheDocument();
    expect(screen.queryByText(/sem a sua revisão/i)).toBeNull();
    expect(screen.getByRole("link", { name: "Enviar outra série" })).toHaveAttribute("href", "/escola/listas/nova");
    expect(screen.getByRole("link", { name: "Voltar para Minhas escolas" })).toHaveAttribute("href", "/escola");
    expect(document.querySelector("main")).toBeNull(); // o `main` é da casca do painel
  });

  it("pronta para a equipe: conta os itens lidos e continua em análise", () => {
    render(<SchoolStatusPanel submissionId={ID} initial={{ ...base, status: "human_review", jobStatus: "succeeded", result }} />);
    expect(screen.getByRole("heading", { level: 2, name: "Em revisão pela equipe" })).toBeInTheDocument();
    expect(screen.getByText("2 itens lidos no arquivo.")).toBeInTheDocument();
  });

  it("publicada: leva à lista oficial e mostra o cartão de divulgação com o link curto", () => {
    render(<SchoolStatusPanel submissionId={ID} initial={{ ...base, status: "published", jobStatus: "succeeded", result, publishedBy: "human", listHref: "/escolas/99029001/ef-5?ano=2027" }} origin="https://listacerta.test" />);
    expect(screen.getByRole("link", { name: "Ver a lista oficial" })).toHaveAttribute("href", "/escolas/99029001/ef-5?ano=2027");
    expect(screen.getByRole("heading", { name: "Compartilhar esta lista" })).toBeInTheDocument();
  });

  it("leitura indisponível: diz que o arquivo está guardado e como seguir", () => {
    render(<SchoolStatusPanel submissionId={ID} initial={{ ...base, pipelineAvailable: false }} />);
    expect(screen.getByRole("heading", { level: 2, name: "Leitura automática indisponível no momento" })).toBeInTheDocument();
    expect(screen.getByText(/arquivo está guardado/)).toBeInTheDocument();
  });

  it("falhou: pede outro arquivo e leva ao envio da escola, não ao da família", () => {
    render(<SchoolStatusPanel submissionId={ID} initial={{ ...base, status: "rejected", jobStatus: "dead" }} />);
    expect(screen.getByRole("link", { name: "Enviar outro arquivo" })).toHaveAttribute("href", "/escola/listas/nova");
  });

  it("consulta o andamento e para em estado final", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ ...base, status: "human_review", jobStatus: "succeeded", result }))));
    render(<SchoolStatusPanel submissionId={ID} initial={base} />);
    await act(() => vi.advanceTimersByTimeAsync(1_600));
    expect(screen.getByRole("heading", { level: 2, name: "Em revisão pela equipe" })).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
