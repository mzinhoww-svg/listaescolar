import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UploadState } from "@/features/schools/upload-schema";

const uploadInepCsv = vi.fn<(prev: UploadState, fd: FormData) => Promise<UploadState>>();
vi.mock("@/app/admin/importacoes/actions", () => ({
  uploadInepCsv: (p: UploadState, f: FormData) => uploadInepCsv(p, f),
}));

import { UploadForm } from "@/app/admin/importacoes/UploadForm";

const totals = { total: 8, inserted: 3, updated: 0, unchanged: 0, duplicate: 2, rejected: 3 };

function pick(name: string, type = "text/csv", size = 10) {
  const file = new File(["x".repeat(size)], name, { type });
  fireEvent.change(screen.getByLabelText(/arquivo csv/i), { target: { files: [file] } });
}
const send = () => fireEvent.click(screen.getByRole("button", { name: /importar/i }));

describe("UploadForm", () => {
  beforeEach(() => uploadInepCsv.mockReset());

  it("avisa quando não há arquivo, sem chamar a action", async () => {
    render(<UploadForm />);
    send();
    expect(await screen.findByRole("alert")).toHaveTextContent("Selecione um arquivo CSV.");
    expect(uploadInepCsv).not.toHaveBeenCalled();
  });

  it("recusa tipo inválido", async () => {
    render(<UploadForm />);
    pick("lista.pdf", "application/pdf");
    send();
    expect(await screen.findByRole("alert")).toHaveTextContent("formato CSV");
    expect(uploadInepCsv).not.toHaveBeenCalled();
  });

  it("mostra enviando e depois o resultado com totais", async () => {
    let resolve!: (s: UploadState) => void;
    uploadInepCsv.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<UploadForm />);
    pick("inep-demo.csv");
    fireEvent.click(screen.getByLabelText(/demonstração/i));
    send();
    expect(await screen.findByRole("button", { name: /importando/i })).toBeDisabled();
    resolve({ status: "success", batchId: "b1", alreadyExisted: false, isDemo: true, batchStatus: "completed", totals });
    expect(await screen.findByText("Importação concluída")).toBeInTheDocument();
    expect(screen.getByText("Inseridas").parentElement).toHaveTextContent("3");
    expect(screen.getByText("Rejeitadas").parentElement).toHaveTextContent("3");
    expect(screen.getByText("Demonstração")).toBeInTheDocument();
    expect(uploadInepCsv.mock.calls[0]?.[1].get("isDemo")).toBe("on");
  });

  it("avisa Arquivo já importado", async () => {
    uploadInepCsv.mockResolvedValue({
      status: "success", batchId: "b1", alreadyExisted: true, isDemo: false, batchStatus: "completed", totals,
    });
    render(<UploadForm />);
    pick("a.csv");
    send();
    expect(await screen.findByText("Arquivo já importado")).toBeInTheDocument();
  });

  it("lista as colunas faltando no erro do arquivo", async () => {
    uploadInepCsv.mockResolvedValue({
      status: "file_error",
      batchId: "b1",
      errors: [{ code: "missing_column", message: "Coluna obrigatória ausente: CO_ENTIDADE", column: "CO_ENTIDADE" }],
    });
    render(<UploadForm />);
    pick("a.csv");
    send();
    expect(await screen.findByRole("alert")).toHaveTextContent("CO_ENTIDADE");
  });

  it("erro genérico oferece tentar de novo", async () => {
    uploadInepCsv.mockResolvedValueOnce({ status: "error", message: "Falhou.", retryable: true });
    render(<UploadForm />);
    pick("a.csv");
    send();
    expect(await screen.findByRole("alert")).toHaveTextContent("Falhou.");
    uploadInepCsv.mockResolvedValueOnce({
      status: "success", batchId: "b2", alreadyExisted: false, isDemo: false, batchStatus: "completed", totals,
    });
    fireEvent.click(screen.getByRole("button", { name: /tentar novamente/i }));
    await waitFor(() => expect(screen.getByText("Importação concluída")).toBeInTheDocument());
  });
});
