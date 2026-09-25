import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const search = vi.fn();
vi.mock("@/app/enviar-lista/school-search-action", () => ({ searchSchoolsAction: (...a: unknown[]) => search(...a) }));

import { LinkedSchoolSelect, SchoolSearchPicker } from "@/components/submissions/SchoolPicker";

const A = { id: "5b1d4c2e-7d1a-4f0e-9a52-0c3f5e9a1b11", name: "Escola Alfa", inep: "51000001" };
const B = { id: "5b1d4c2e-7d1a-4f0e-9a52-0c3f5e9a1b22", name: "Escola Beta", inep: "51000002" };

describe("LinkedSchoolSelect (escola vinculada)", () => {
  it("uma só escola vinculada: já vem escolhida", () => {
    render(<LinkedSchoolSelect schools={[A]} />);
    expect(screen.getByLabelText("Escola")).toHaveValue(A.id);
  });
  it("várias: escolha obrigatória, com o initialId quando ele é vinculado", () => {
    const { rerender } = render(<LinkedSchoolSelect schools={[A, B]} />);
    expect(screen.getByLabelText("Escola")).toHaveValue("");
    expect(screen.getByLabelText("Escola")).toBeRequired();
    rerender(<LinkedSchoolSelect key="x" schools={[A, B]} initialId={B.id} />);
    expect(screen.getByLabelText("Escola")).toHaveValue(B.id);
  });
  it("initialId de escola que não é vinculada é ignorado (o servidor recusaria de qualquer forma)", () => {
    render(<LinkedSchoolSelect schools={[A, B]} initialId="5b1d4c2e-7d1a-4f0e-9a52-0c3f5e9a1b99" />);
    expect(screen.getByLabelText("Escola")).toHaveValue("");
  });
});

describe("SchoolSearchPicker (busca da S04)", () => {
  it("busca, escolhe e leva o id no campo schoolId; 'Trocar' limpa", async () => {
    search.mockResolvedValue({ status: "ok", hits: [{ ...A, neighborhood: "Centro", municipalityName: "Cuiabá" }] });
    const { container } = render(<SchoolSearchPicker />);
    expect((container.querySelector('input[name="schoolId"]') as HTMLInputElement).value).toBe("");
    fireEvent.change(screen.getByLabelText("Buscar escola por nome ou INEP"), { target: { value: "alfa" } });
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
    fireEvent.click(await screen.findByRole("button", { name: /Escola Alfa/ }));
    expect((container.querySelector('input[name="schoolId"]') as HTMLInputElement).value).toBe(A.id);
    expect(search).toHaveBeenCalledWith("alfa");
    fireEvent.click(screen.getByRole("button", { name: "Trocar" }));
    expect((container.querySelector('input[name="schoolId"]') as HTMLInputElement).value).toBe("");
  });
  it("sem resultado e erro têm frases próprias; busca curta demais não dispara", async () => {
    search.mockResolvedValueOnce({ status: "ok", hits: [] });
    render(<SchoolSearchPicker />);
    const input = screen.getByLabelText("Buscar escola por nome ou INEP");
    expect(screen.getByRole("button", { name: "Buscar" })).toBeDisabled();
    fireEvent.change(input, { target: { value: "zz" } });
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
    expect(await screen.findByText("Nenhuma escola encontrada.")).toBeInTheDocument();
    search.mockResolvedValueOnce({ status: "error" });
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível buscar agora"));
  });
});
