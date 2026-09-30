// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const submitListAction = vi.fn();
const canvasResize = vi.fn();
vi.mock("@/components/submissions/prepareUpload", async (orig) => {
  const real = await orig<typeof import("@/components/submissions/prepareUpload")>();
  return { ...real, prepareUpload: (f: File) => real.prepareUpload(f, { resize: canvasResize }) };
});
vi.mock("@/app/enviar-lista/school-search-action", () => ({ searchSchoolsAction: async () => ({ status: "ok", hits: [] }) }));
vi.mock("@/app/enviar-lista/actions", () => ({ submitListAction: (p: unknown, f: FormData) => submitListAction(p, f) }));

import { SubmitForm } from "@/app/enviar-lista/SubmitForm";
import { isControlFlowError, isRetryable, submitFailureCode } from "@/features/submissions/network";

const pdf = () => new File([new Uint8Array([37, 80, 68, 70])], "lista-5-ano.pdf", { type: "application/pdf" });
const fillAll = () => {
  fireEvent.change(screen.getByLabelText("Série"), { target: { value: "5º ano" } });
  fireEvent.change(screen.getByLabelText("Arquivo da lista"), { target: { files: [pdf()] } });
  fireEvent.click(screen.getByRole("checkbox"));
};
const send = () => fireEvent.click(screen.getByRole("button", { name: /enviar para revisão/i }));
const renderForm = (props: Partial<Parameters<typeof SubmitForm>[0]> = {}) => render(<SubmitForm years={[2027]} defaultYear={2027} {...props} />);

afterEach(() => vi.unstubAllGlobals());

describe("UX-061 · falha de rede no envio", () => {
  beforeEach(() => submitListAction.mockReset());

  it("fetch rejeitado: erro acionável e 'Tentar de novo' reenvia sem pedir a série de novo", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);
    // a Server Action viaja por fetch: rede fora = a chamada rejeita
    submitListAction.mockImplementationOnce(async () => {
      await fetch("/enviar-lista");
      return { status: "idle" };
    });
    submitListAction.mockResolvedValue({ status: "idle" });
    renderForm();
    fillAll();
    send();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/conexão/i);
    expect(alert).toHaveTextContent(/Meus envios/);
    expect(screen.getByRole("link", { name: "Meus envios" })).toHaveAttribute("href", "/conta/envios");
    const retry = screen.getByRole("button", { name: "Tentar de novo" });
    expect(submitListAction).toHaveBeenCalledTimes(1);

    fireEvent.click(retry);
    await waitFor(() => expect(submitListAction).toHaveBeenCalledTimes(2));
    const first = submitListAction.mock.calls[0]![1] as FormData;
    const second = submitListAction.mock.calls[1]![1] as FormData;
    expect(second.get("grade")).toBe("5º ano");
    expect(second.get("grade")).toBe(first.get("grade"));
    expect(second.get("schoolYear")).toBe(first.get("schoolYear"));
    expect(second.get("consent")).toBe("on");
    // nada foi pedido de novo: a série continua escolhida e nenhum erro de campo apareceu
    expect(screen.getByLabelText("Série")).toHaveValue("5º ano");
    expect(screen.getByLabelText("Série")).toHaveAttribute("aria-invalid", "false");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Tentar de novo" })).not.toBeInTheDocument());
  });

  it("erro que não é de rede (arquivo inválido) não oferece 'Tentar de novo'", async () => {
    submitListAction.mockResolvedValue({ status: "error", code: "signature_mismatch", message: "O conteúdo do arquivo não confere com o tipo informado. Escolha outro arquivo." });
    renderForm();
    fillAll();
    send();
    await screen.findByRole("alert");
    expect(screen.queryByRole("button", { name: "Tentar de novo" })).not.toBeInTheDocument();
  });
});

describe("classificação da falha do envio", () => {
  it("redirect e notFound da action são fluxo de controle, não erro de rede", () => {
    expect(isControlFlowError(Object.assign(new Error("x"), { digest: "NEXT_REDIRECT;push;/enviar-lista/x;307;" }))).toBe(true);
    expect(isControlFlowError(Object.assign(new Error("x"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" }))).toBe(true);
    expect(isControlFlowError(new TypeError("Failed to fetch"))).toBe(false);
  });
  it("TypeError de fetch vira 'network'; outro erro vira 'unexpected'; os dois deixam tentar de novo", () => {
    expect(submitFailureCode(new TypeError("Load failed"))).toBe("network");
    expect(submitFailureCode(new Error("boom"))).toBe("unexpected");
    expect(isRetryable("network")).toBe(true);
    expect(isRetryable("unexpected")).toBe(true);
    expect(isRetryable("signature_mismatch")).toBe(false);
  });
});

describe("UX-064 · tudo de uma vez, cada erro junto do campo", () => {
  beforeEach(() => submitListAction.mockReset());

  it("formulário vazio: três erros ao mesmo tempo, ligados aos campos, com foco no primeiro", async () => {
    renderForm();
    send();
    const alerts = await screen.findAllByRole("alert");
    expect(alerts).toHaveLength(3);
    const grade = screen.getByLabelText("Série");
    const consent = screen.getByRole("checkbox");
    const file = screen.getByLabelText("Arquivo da lista");
    for (const field of [grade, consent, file]) {
      expect(field).toHaveAttribute("aria-invalid", "true");
      const target = document.getElementById(field.getAttribute("aria-describedby") ?? "");
      expect(target).not.toBeNull();
      expect(alerts).toContain(target);
    }
    expect(screen.getByRole("button", { name: /escolher da galeria ou foto|galeria ou pdf/i })).toHaveFocus();
    expect(submitListAction).not.toHaveBeenCalled();
  });

  it("corrigir um campo limpa só o erro dele", async () => {
    renderForm();
    send();
    await screen.findAllByRole("alert");
    fireEvent.change(screen.getByLabelText("Série"), { target: { value: "5º ano" } });
    expect(screen.getAllByRole("alert")).toHaveLength(2);
    expect(screen.getByLabelText("Série")).toHaveAttribute("aria-invalid", "false");
  });
});

describe("UX-063 e UX-067 · uma ação principal, aviso uma vez, consentimento claro", () => {
  it("só 'Enviar para revisão' é principal; sem faixa verde da IA", () => {
    renderForm();
    const primaries = screen.getAllByRole("button").filter((b) => b.className.includes("bg-tinta"));
    expect(primaries.map((b) => b.textContent)).toEqual(["Enviar para revisão"]);
    expect(screen.queryByText(/A IA lê a lista/)).not.toBeInTheDocument();
  });

  it("o aviso de revisão aparece uma única vez", () => {
    renderForm();
    expect(screen.getAllByText(/revisad[ao]|revisão/i).filter((n) => n.tagName !== "H1" && n.tagName !== "BUTTON")).toHaveLength(1);
  });

  it("o consentimento diz IA, revisão pela equipe e pede para não mostrar dado do aluno; guarda fica 'indisponível'", () => {
    renderForm();
    const label = screen.getByRole("checkbox").closest("label")!;
    expect(label).toHaveTextContent(/inteligência artificial/);
    expect(label).toHaveTextContent(/equipe/);
    expect(label).toHaveTextContent(/nome de aluno|dado do aluno/);
    expect(screen.getByText(/prazo de guarda.*indisponível/i)).toBeInTheDocument();
  });

  it("título com o tamanho das outras telas (28 px), sem hex avulso", () => {
    renderForm();
    expect(screen.getByRole("heading", { level: 1 }).className).toContain("text-[28px]");
    expect(document.body.innerHTML).not.toMatch(/#7a4a0a|#ffb4a8/i);
  });
});

describe("UX-069 · Voltar", () => {
  it("sem escola de origem volta para a conta", () => {
    renderForm();
    expect(screen.getByRole("link", { name: "Voltar" })).toHaveAttribute("href", "/conta");
  });
  it("com a escola pré-escolhida volta para a página dela", () => {
    renderForm({ initialSchool: { id: "10000000-0000-4000-8000-0000000000b1", name: "Escola Modelo", inep: "51000001", neighborhood: "Centro", municipalityName: "Cuiabá" } });
    expect(screen.getByRole("link", { name: "Voltar" })).toHaveAttribute("href", "/escolas/51000001");
  });
});

describe("UX-071 · foto ou PDF e aviso de redução", () => {
  beforeEach(() => submitListAction.mockReset());
  const big = () => {
    const f = new File([new Uint8Array(1)], "foto.png", { type: "image/png" });
    Object.defineProperty(f, "size", { value: 6_000_000 });
    return f;
  };

  it("diz 'Reduzimos a foto para caber' quando a redução acontece, sem segundo main nem segundo h1 (UX-073)", async () => {
    canvasResize.mockReset().mockResolvedValue(new Blob([new Uint8Array(10)], { type: "image/jpeg" }));
    let finish: (v: unknown) => void = () => undefined;
    submitListAction.mockReturnValue(new Promise((r) => (finish = r)));
    renderForm();
    fireEvent.change(screen.getByLabelText("Série"), { target: { value: "5º ano" } });
    fireEvent.change(screen.getByLabelText("Arquivo da lista"), { target: { files: [big()] } });
    fireEvent.click(screen.getByRole("checkbox"));
    send();
    expect(await screen.findByText("Enviando sua lista")).toBeInTheDocument();
    expect(screen.getAllByText(/Reduzimos a foto para caber/).length).toBeGreaterThan(0);
    expect(document.querySelectorAll("main")).toHaveLength(1);
    expect(document.querySelectorAll("h1")).toHaveLength(1);
    await act(async () => finish({ status: "idle" }));
  });

  it("mensagens de formato falam 'foto ou PDF', sem siglas de formato", async () => {
    const { ERROR_MESSAGES } = await import("@/features/submissions/copy");
    expect(ERROR_MESSAGES.unsupported_type).toMatch(/foto ou PDF/);
    expect(ERROR_MESSAGES.unsupported_type).not.toMatch(/JPG|WEBP|HEIC/);
    expect(ERROR_MESSAGES.pdf_too_large).not.toMatch(/Comprima/);
    expect(ERROR_MESSAGES.image_undecodable).not.toMatch(/HEIC/);
  });
});

describe("UX-070 · escola", () => {
  it("rótulo visível 'Nome ou código INEP da escola' e explicação do INEP", () => {
    renderForm();
    expect(screen.getByLabelText("Nome ou código INEP da escola")).toBeInTheDocument();
    expect(screen.getByText(/número da escola no Censo Escolar/)).toBeInTheDocument();
  });
  it("não há botão 'Buscar' desabilitado: a busca é ao digitar", () => {
    renderForm();
    expect(screen.queryByRole("button", { name: "Buscar" })).not.toBeInTheDocument();
  });
});
void act; void within;
