import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enviarComRetry } from "@/components/pesquisa/retry";

describe("enviarComRetry", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("sucesso na 1ª tentativa: não espera nem chama onFalhaFinal", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const onFalhaFinal = vi.fn();

    await enviarComRetry("/api/x", { a: 1 }, onFalhaFinal);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onFalhaFinal).not.toHaveBeenCalled();
  });

  it("3 falhas: espera 1s, 3s e 9s entre tentativas, depois chama onFalhaFinal", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal("fetch", fetchMock);
    const onFalhaFinal = vi.fn();

    const promise = enviarComRetry("/api/x", { a: 1 }, onFalhaFinal);

    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(3000);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(9000);
    expect(fetchMock).toHaveBeenCalledTimes(4);

    await promise;
    expect(onFalhaFinal).toHaveBeenCalledTimes(1);
  });

  it("erro de rede (fetch lança) conta como falha e tenta de novo", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);
    const onFalhaFinal = vi.fn();

    const promise = enviarComRetry("/api/x", { a: 1 }, onFalhaFinal);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(3000);
    await vi.advanceTimersByTimeAsync(9000);
    await promise;

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(onFalhaFinal).toHaveBeenCalledTimes(1);
  });

  it("resposta 4xx é falha definitiva: uma tentativa só, sem esperar, e chama onFalhaFinal", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 400 });
    vi.stubGlobal("fetch", fetchMock);
    const onFalhaFinal = vi.fn();

    await enviarComRetry("/api/x", { a: 1 }, onFalhaFinal);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onFalhaFinal).toHaveBeenCalledTimes(1);
  });

  it("5xx continua sendo repetido com backoff", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    const onFalhaFinal = vi.fn();

    const promise = enviarComRetry("/api/x", { a: 1 }, onFalhaFinal);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);
    await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onFalhaFinal).not.toHaveBeenCalled();
  });

  it("sucesso na 2ª tentativa: não chama onFalhaFinal e para de tentar", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const onFalhaFinal = vi.fn();

    const promise = enviarComRetry("/api/x", { a: 1 }, onFalhaFinal);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);
    await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onFalhaFinal).not.toHaveBeenCalled();
  });
});
