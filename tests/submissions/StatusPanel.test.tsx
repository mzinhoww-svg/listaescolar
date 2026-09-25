import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/enviar-lista/[submissionId]/actions", () => ({ setNotifyAction: vi.fn() }));

import { StatusPanel } from "@/app/enviar-lista/[submissionId]/StatusPanel";
import type { StatusPayload } from "@/features/submissions/status-model";

const base: StatusPayload = { status: "processing_async", jobStatus: "queued", attempts: 0, notifyChannel: "none", isDemo: false, pipelineAvailable: true };
const result = { items: [{ name: "Caderno", quantity: 2, unit: "un", confidence: 0.9 }], overallConfidence: 0.9, warnings: [] };
const ID = "5b1d4c2e-7d1a-4f0e-9a52-0c3f5e9a1b11";

const respond = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));

describe("StatusPanel", () => {
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

  it("assíncrono: mostra as etapas e as três opções, sem itens", () => {
    render(<StatusPanel submissionId={ID} initial={base} />);
    expect(screen.getByText("Lendo os itens e as quantidades")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuar aguardando" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ativar notificação do navegador" })).toBeInTheDocument();
    expect(screen.getByLabelText("E-mail ou WhatsApp para o aviso")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Itens lidos" })).toBeNull();
  });

  it("consulta com intervalo crescente e PARA quando o resultado fica pronto", async () => {
    fetchMock
      .mockImplementationOnce(() => respond(base))
      .mockImplementationOnce(() => respond({ ...base, status: "review_needed", jobStatus: "succeeded", result }));
    render(<StatusPanel submissionId={ID} initial={base} />);
    await act(() => vi.advanceTimersByTimeAsync(1_600)); // 1ª consulta (1,5 s)
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/submissions/${ID}/status`);
    await act(() => vi.advanceTimersByTimeAsync(2_000)); // 2ª (2,4 s depois: ainda não)
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("heading", { name: "Lista lida" })).toBeInTheDocument();
    expect(screen.getByText("Caderno")).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(fetchMock).toHaveBeenCalledTimes(2); // parou
  });

  it("estado final na carga inicial: não consulta nada", async () => {
    render(<StatusPanel submissionId={ID} initial={{ ...base, status: "review_needed", jobStatus: "succeeded", result }} />);
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("vazio: resultado sem itens", () => {
    render(<StatusPanel submissionId={ID} initial={{ ...base, status: "review_needed", result: { items: [], overallConfidence: 0, warnings: [] } }} />);
    expect(screen.getByText("Nenhum item foi identificado neste arquivo.")).toBeInTheDocument();
  });

  it("job morto vira erro e para de consultar", async () => {
    fetchMock.mockImplementation(() => respond({ ...base, status: "rejected", jobStatus: "dead", attempts: 5 }));
    render(<StatusPanel submissionId={ID} initial={base} />);
    await act(() => vi.advanceTimersByTimeAsync(1_600));
    expect(screen.getByText("Não foi possível ler este arquivo")).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sem pipeline: diz que a leitura automática está indisponível, não consulta e não inventa itens", async () => {
    render(<StatusPanel submissionId={ID} initial={{ ...base, pipelineAvailable: false }} />);
    expect(screen.getByText("Leitura automática indisponível no momento")).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("demonstração leva o selo", () => {
    render(<StatusPanel submissionId={ID} initial={{ ...base, status: "review_needed", isDemo: true, result }} />);
    expect(screen.getByText("Demonstração")).toBeInTheDocument();
  });

  it("5 falhas seguidas: avisa e para", async () => {
    fetchMock.mockImplementation(() => respond({ error: "x" }, 500));
    render(<StatusPanel submissionId={ID} initial={base} />);
    await act(() => vi.advanceTimersByTimeAsync(120_000));
    expect(screen.getByText("Não conseguimos atualizar o andamento")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
});
