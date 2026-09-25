import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { IDLE, state, type ReviewActionState } from "@/app/admin/revisao/state";
import { DraftProvider, useDraft } from "@/components/review/DraftContext";
import { ReviewItemsEditor, type ReviewDraft } from "@/components/review/ReviewItemsEditor";
import type { ReviewItem } from "@/features/review/schemas";

const item = (o: Partial<ReviewItem> = {}): ReviewItem => ({ name: "Caderno", quantity: 2, unit: null, category: "papelaria", confidence: 0.9, alerts: [], origin: "extracted", ...o });
const initial: ReviewDraft = { grade: "4º ano", schoolYear: 2027, items: [item(), item({ name: "Lápis", quantity: null, confidence: 0.4 })] };
const TH = { confidenceThreshold: 0.8, itemConfidenceThreshold: 0.6 };
type Act = (prev: ReviewActionState, fd: FormData) => Promise<ReviewActionState>;

describe("rascunho, validação e avisos do editor", () => {
  const wrap = (v: number, init: ReviewDraft, save?: Act) => (
    <DraftProvider>
      <ReviewItemsEditor submissionId="s1" version={v} initial={init} thresholds={TH} readOnly={false} action={save ?? (async () => IDLE)} />
    </DraftProvider>
  );
  it("re-renderização com versão nova NÃO troca o rascunho; salvar ainda envia a versão-base (stale no servidor)", async () => {
    const save = vi.fn<Act>(async () => state("stale", "Alterada por outra pessoa."));
    const { rerender } = render(wrap(2, initial, save));
    fireEvent.change(screen.getByLabelText("Nome do item 1"), { target: { value: "Meu rascunho" } });
    rerender(wrap(3, { ...initial, items: [item({ name: "Do outro admin" }), initial.items[1]!] }, save));
    expect(screen.getByLabelText("Nome do item 1")).toHaveValue("Meu rascunho");
    fireEvent.click(screen.getByRole("button", { name: "Salvar edição" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(JSON.parse(String(save.mock.calls[0]![1].get("payload"))).expectedVersion).toBe(2);
    fireEvent.click(await screen.findByRole("button", { name: "Recarregar a versão mais recente" }));
    rerender(wrap(3, { ...initial, items: [item({ name: "Do outro admin" }), initial.items[1]!] }, save));
    expect(screen.getByLabelText("Nome do item 1")).toHaveValue("Do outro admin");
  });
  it("depois de salvar, a versão nova vira a base: não fica sujo, aprovar habilita e o próximo envio usa a versão nova", async () => {
    const Probe = () => <button type="button" disabled={useDraft().dirty}>Aprovar e publicar</button>;
    const save = vi.fn<Act>(async () => state("saved", "Edição salva (versão 3)."));
    const tree = (v: number, init: ReviewDraft) => (
      <DraftProvider>
        <ReviewItemsEditor submissionId="s1" version={v} initial={init} thresholds={TH} readOnly={false} action={save} />
        <Probe />
      </DraftProvider>
    );
    const edited: ReviewDraft = { ...initial, items: [item({ name: "Editado", origin: "edited" }), initial.items[1]!] };
    const { rerender } = render(tree(2, initial));
    fireEvent.change(screen.getByLabelText("Nome do item 1"), { target: { value: "Editado" } });
    expect(screen.getByRole("button", { name: "Aprovar e publicar" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Salvar edição" }));
    await screen.findByText("Edição salva (versão 3).");
    rerender(tree(3, edited));
    await waitFor(() => expect(screen.getByRole("button", { name: "Aprovar e publicar" })).toBeEnabled());
    expect(screen.queryByText("Edição não salva")).toBeNull();
    fireEvent.change(screen.getByLabelText("Nome do item 1"), { target: { value: "Editado de novo" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar edição" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String(save.mock.calls[1]![1].get("payload"))).expectedVersion).toBe(3);
  });
  it("sem edição não salva, a versão nova entra sozinha", () => {
    const { rerender } = render(wrap(2, initial));
    rerender(wrap(3, { ...initial, items: [item({ name: "Nova" })] }));
    expect(screen.getByLabelText("Nome do item 1")).toHaveValue("Nova");
  });
  it("item adicionado nasce sem quantidade ('?'); fracionária ou 0 bloqueia salvar com aviso na linha", () => {
    render(wrap(2, initial));
    fireEvent.click(screen.getByRole("button", { name: "Adicionar item" }));
    expect(screen.getByLabelText("Quantidade do item 3")).toHaveValue(null);
    fireEvent.change(screen.getByLabelText("Quantidade do item 1"), { target: { value: "1.5" } });
    expect(screen.getAllByRole("alert")[0]).toHaveTextContent("número inteiro de 1 a 9999");
    expect(screen.getByRole("button", { name: "Salvar edição" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Quantidade do item 1"), { target: { value: "0" } });
    expect(screen.getByRole("button", { name: "Salvar edição" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Quantidade do item 1"), { target: { value: "3" } });
    expect(screen.getByRole("button", { name: "Salvar edição" })).toBeEnabled();
  });
  it("beforeunload só com edição não salva", () => {
    render(wrap(2, initial));
    const ev = () => { const e = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; };
    expect(ev()).toBe(false);
    fireEvent.change(screen.getByLabelText("Nome do item 1"), { target: { value: "x" } });
    expect(ev()).toBe(true);
  });
  it("categorias com rótulo legível e valor cru só no value", () => {
    render(wrap(2, initial));
    const opt = screen.getAllByRole("option", { name: "Papelaria" })[0] as HTMLOptionElement;
    expect(opt.value).toBe("papelaria");
    expect(screen.queryAllByRole("option", { name: "papelaria" })).toHaveLength(0);
  });
});

