import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const submitListAction = vi.fn();
const canvasResize = vi.fn();
vi.mock("@/components/submissions/prepareUpload", async (orig) => {
  const real = await orig<typeof import("@/components/submissions/prepareUpload")>();
  return { ...real, prepareUpload: (f: File) => real.prepareUpload(f, { resize: canvasResize }) };
});
vi.mock("@/app/enviar-lista/school-search-action", () => ({ searchSchoolsAction: async () => ({ status: "ok", hits: [] }) }));
vi.mock("@/app/enviar-lista/actions", () => ({ submitListAction: (p: unknown, f: FormData) => submitListAction(p, f) }));

import { SubmitForm } from "@/app/enviar-lista/SubmitForm";
import { SchoolUploadForm } from "@/app/escola/listas/nova/SchoolUploadForm";

const pdf = () => new File([new Uint8Array([37, 80, 68, 70])], "lista-5-ano.pdf", { type: "application/pdf" });

function fill({ consent = true, file = true, grade = "5º ano" } = {}) {
  if (grade) fireEvent.change(screen.getByLabelText("Série"), { target: { value: grade } });
  if (file) fireEvent.change(screen.getByLabelText("Arquivo da lista"), { target: { files: [pdf()] } });
  if (consent) fireEvent.click(screen.getByRole("checkbox"));
}
const send = () => fireEvent.click(screen.getByRole("button", { name: /enviar para revisão/i }));

describe("SubmitForm (App15/App06)", () => {
  beforeEach(() => submitListAction.mockReset());

  it("mostra o aviso de revisão, o consentimento desmarcado e as duas formas de enviar", () => {
    render(<SubmitForm years={[2026, 2027]} defaultYear={2027} />);
    expect(screen.getByText("Sua lista passa por revisão antes de aparecer para outras famílias.")).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByRole("button", { name: /tirar foto/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /galeria ou pdf/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Ano letivo")).toHaveValue("2027");
  });

  it("o campo de foto usa a câmera traseira (capture)", () => {
    render(<SubmitForm years={[2027]} defaultYear={2027} />);
    expect(screen.getByLabelText("Tirar foto da lista")).toHaveAttribute("capture", "environment");
  });

  it("sem consentimento: bloqueia e não chama a action", async () => {
    render(<SubmitForm years={[2027]} defaultYear={2027} />);
    fill({ consent: false });
    send();
    expect(await screen.findByRole("alert")).toHaveTextContent("Marque o consentimento");
    expect(submitListAction).not.toHaveBeenCalled();
  });

  it("sem arquivo ou sem série: bloqueia", async () => {
    render(<SubmitForm years={[2027]} defaultYear={2027} />);
    fill({ file: false, grade: "" });
    send();
    expect(await screen.findByRole("alert")).toHaveTextContent("Confira a série");
    fireEvent.change(screen.getByLabelText("Série"), { target: { value: "5º ano" } });
    send();
    expect(await screen.findByRole("alert")).toHaveTextContent("Escolha um arquivo");
    expect(submitListAction).not.toHaveBeenCalled();
  });

  it("arquivo acima de 4 MB é recusado no navegador", async () => {
    render(<SubmitForm years={[2027]} defaultYear={2027} />);
    fill({ file: false });
    const big = new File([new Uint8Array(1)], "grande.pdf", { type: "application/pdf" });
    Object.defineProperty(big, "size", { value: 11 * 1024 * 1024 });
    fireEvent.change(screen.getByLabelText("Arquivo da lista"), { target: { files: [big] } });
    send();
    expect(await screen.findByRole("alert")).toHaveTextContent("passa de 4 MB");
    expect(submitListAction).not.toHaveBeenCalled();
  });

  const pick = (file: File) => {
    fireEvent.change(screen.getByLabelText("Série"), { target: { value: "5º ano" } });
    fireEvent.change(screen.getByLabelText("Arquivo da lista"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("checkbox"));
  };
  const sized = (name: string, type: string, size: number) => {
    const f = new File([new Uint8Array(1)], name, { type });
    Object.defineProperty(f, "size", { value: size });
    return f;
  };

  it("PDF acima de 4 MB: mensagem própria, sem chamar a action", async () => {
    render(<SubmitForm years={[2027]} defaultYear={2027} />);
    pick(sized("lista.pdf", "application/pdf", 5_000_000));
    send();
    expect(await screen.findByRole("alert")).toHaveTextContent("Este PDF passa de 4 MB");
    expect(submitListAction).not.toHaveBeenCalled();
  });

  it("foto acima de 3 MB: reduzida no navegador e enviada como JPEG", async () => {
    canvasResize.mockReset().mockResolvedValue(new Blob([new Uint8Array(10)], { type: "image/jpeg" }));
    submitListAction.mockResolvedValue({ status: "idle" });
    render(<SubmitForm years={[2027]} defaultYear={2027} />);
    pick(sized("foto.png", "image/png", 6_000_000));
    send();
    await waitFor(() => expect(submitListAction).toHaveBeenCalledTimes(1));
    expect(canvasResize).toHaveBeenCalledWith(expect.any(File), 2400, 0.85);
    const sent = (submitListAction.mock.calls[0]![1] as FormData).get("file") as File;
    expect(sent.name).toBe("foto.jpg");
    expect(sent.type).toBe("image/jpeg");
  });

  it("HEIC grande que o navegador não decodifica: mensagem clara", async () => {
    canvasResize.mockReset().mockRejectedValue(new Error("decode"));
    render(<SubmitForm years={[2027]} defaultYear={2027} />);
    pick(sized("IMG_1.heic", "image/heic", 6_000_000));
    send();
    expect(await screen.findByRole("alert")).toHaveTextContent("JPG ou PNG");
    expect(submitListAction).not.toHaveBeenCalled();
  });

  it("completo: chama a action com consentimento, série, ano e arquivo", async () => {
    submitListAction.mockResolvedValue({ status: "idle" });
    render(<SubmitForm years={[2026, 2027]} defaultYear={2027} />);
    fill();
    expect(screen.getByTestId("picked")).toHaveTextContent("lista-5-ano.pdf");
    send();
    await waitFor(() => expect(submitListAction).toHaveBeenCalledTimes(1));
    const data = submitListAction.mock.calls[0]![1] as FormData;
    expect(data.get("consent")).toBe("on");
    expect(data.get("grade")).toBe("5º ano");
    expect(data.get("schoolYear")).toBe("2027");
    // (o jsdom não leva `files` simulados ao FormData; o arquivo real é coberto pelo E2E)
    expect(data.get("profileId")).toBeNull(); // o dono vem da sessão, nunca do formulário
  });

  it("mostra o erro devolvido pela action (arquivo inválido)", async () => {
    submitListAction.mockResolvedValue({ status: "error", code: "signature_mismatch", message: "O conteúdo do arquivo não confere com o tipo informado. Escolha outro arquivo." });
    render(<SubmitForm years={[2027]} defaultYear={2027} />);
    fill();
    send();
    expect(await screen.findByRole("alert")).toHaveTextContent("não confere com o tipo");
  });

  it("enquanto envia, mostra a tela de leitura (App20)", async () => {
    let finish: (v: unknown) => void = () => undefined;
    submitListAction.mockReturnValue(new Promise((r) => (finish = r)));
    render(<SubmitForm years={[2027]} defaultYear={2027} />);
    fill();
    send();
    expect(await screen.findByText("Enviando sua lista")).toBeInTheDocument();
    await act(async () => finish({ status: "idle" }));
  });
});

describe("SchoolUploadForm (Escola08)", () => {
  beforeEach(() => submitListAction.mockReset());
  const SCHOOL = "5b1d4c2e-7d1a-4f0e-9a52-0c3f5e9a1b11";

  it("mostra as dicas, envia o schoolId e bloqueia sem consentimento", async () => {
    submitListAction.mockResolvedValue({ status: "idle" });
    render(<SchoolUploadForm schools={[{ id: SCHOOL, name: "Escola Modelo", inep: "51000001" }]} initialSchoolId={null} years={[2026, 2027]} defaultYear={2027} />);
    expect(screen.getByText("Para a leitura sair certa")).toBeInTheDocument();
    expect(screen.getByText("Nada é publicado sem a sua revisão.")).toBeInTheDocument();
    fill({ consent: false });
    send();
    expect(await screen.findByRole("alert")).toHaveTextContent("Marque o consentimento");
    expect(submitListAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox"));
    send();
    await waitFor(() => expect(submitListAction).toHaveBeenCalledTimes(1));
    expect((submitListAction.mock.calls[0]![1] as FormData).get("schoolId")).toBe(SCHOOL);
  });
});
