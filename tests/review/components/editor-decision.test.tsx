import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { IDLE, state, type ReviewActionState } from "@/app/admin/revisao/state";
import { AlertNote } from "@/components/review/AlertNote";
import { ConfidenceBadge } from "@/components/review/ConfidenceBadge";
import { ReviewDocument } from "@/components/review/ReviewDocument";
import { DecisionPanel } from "@/components/review/DecisionPanel";
import { DraftProvider } from "@/components/review/DraftContext";
import { ReviewItemsEditor, type ReviewDraft } from "@/components/review/ReviewItemsEditor";
import type { ReviewItem } from "@/features/review/schemas";

const item = (o: Partial<ReviewItem> = {}): ReviewItem => ({ name: "Caderno", quantity: 2, unit: null, category: "papelaria", confidence: 0.9, alerts: [], origin: "extracted", ...o });
const initial: ReviewDraft = { grade: "4º ano", schoolYear: 2027, items: [item(), item({ name: "Lápis", quantity: null, confidence: 0.4 })] };
const TH = { confidenceThreshold: 0.8, itemConfidenceThreshold: 0.6 };
type Act = (prev: ReviewActionState, fd: FormData) => Promise<ReviewActionState>;

function Workbench({ save, blockers = [], status = "human_review", actions, canPublish = false, orphaned = false, available = true, demo = false }: { save?: Act; blockers?: never[] | string[] | null; status?: string; canPublish?: boolean; orphaned?: boolean; available?: boolean; demo?: boolean; actions?: Partial<Record<"approveAndPublish" | "reject" | "publish" | "reconcile", Act>> }) {
  const noop: Act = async () => IDLE;
  return (
    <DraftProvider>
      <ReviewItemsEditor submissionId="s1" version={2} initial={initial} thresholds={TH} readOnly={false} action={save ?? noop} />
      <DecisionPanel
        submissionId="s1"
        version={2}
        status={status}
        blockers={blockers as never[] | null}
        canPublish={canPublish}
        orphaned={orphaned}
        publicationAvailable={available}
        demoPublication={demo}
        actions={{ approveAndPublish: actions?.approveAndPublish ?? noop, reject: actions?.reject ?? noop, publish: actions?.publish ?? noop, reconcile: actions?.reconcile ?? noop }}
      />
    </DraftProvider>
  );
}

describe("ConfidenceBadge e AlertNote", () => {
  it("faixas com texto (não só cor) e 'Conferido pela equipe' sem número", () => {
    const { rerender } = render(<ConfidenceBadge band="alta" confidence={0.92} />);
    expect(screen.getByText("Confiança alta · 92%")).toBeInTheDocument();
    rerender(<ConfidenceBadge band="conferido" confidence={0.5} />);
    expect(screen.getByText("Conferido pela equipe")).toBeInTheDocument();
    rerender(<ConfidenceBadge band="indisponivel" confidence={null} />);
    expect(screen.getByText("Faixa indisponível")).toBeInTheDocument();
  });
  it("alerta neutro, sem citar lei nem órgão; código desconhecido nunca é ecoado", () => {
    const { container, rerender } = render(<AlertNote code="restrictive_brand_or_spec" />);
    expect(container.textContent).not.toMatch(/Procon|Lei|12\.886/);
    rerender(<AlertNote code="<b>x</b>" critical />);
    expect(container.textContent).toContain("Alerta do documento");
    expect(container.textContent).not.toContain("<b>");
  });
});

describe("ReviewItemsEditor", () => {
  it("todos os campos têm rótulo acessível; lixeira tem aria-label; ? para quantidade nula", () => {
    render(<Workbench />);
    for (const n of ["Série", "Ano letivo", "Nome do item 1", "Quantidade do item 1", "Categoria do item 1", "Nome do item 2", "Quantidade do item 2"]) expect(screen.getByLabelText(n)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remover item 2" })).toBeInTheDocument();
    expect(screen.getByLabelText("Quantidade do item 2")).toHaveAttribute("placeholder", "?");
    expect(screen.getByText("Confiança baixa · 40%")).toBeInTheDocument();
  });
  it("editar marca 'Edição não salva', bloqueia aprovar; salvar envia lista + versão esperada (sem actorId)", async () => {
    const save = vi.fn<Act>(async () => state("saved", "Edição salva (versão 3)."));
    render(<Workbench save={save} />);
    expect(screen.getByRole("button", { name: "Salvar edição" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Quantidade do item 2"), { target: { value: "5" } });
    expect(screen.getByText("Edição não salva")).toBeInTheDocument();
    expect(screen.getByText("Salve a edição antes de aprovar.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aprovar e publicar" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Salvar edição" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    const fd = save.mock.calls[0]![1];
    const payload = JSON.parse(String(fd.get("payload")));
    expect(payload.expectedVersion).toBe(2);
    expect(payload.items[1]).toMatchObject({ quantity: 5, origin: "edited" });
    expect(payload.items[0].origin).toBe("extracted");
    expect(fd.get("submissionId")).toBe("s1");
    expect(JSON.stringify(payload)).not.toContain("actorId");
    expect(await screen.findByText("Edição salva (versão 3).")).toBeInTheDocument();
  });
  it("stale: aviso claro (role=alert), rascunho preservado e botão de recarregar", async () => {
    const save = vi.fn<Act>(async () => state("stale", "Esta lista foi alterada por outra pessoa. Recarregue."));
    render(<Workbench save={save} />);
    fireEvent.change(screen.getByLabelText("Nome do item 1"), { target: { value: "Caderno grande" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar edição" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("alterada por outra pessoa");
    expect(screen.getByLabelText("Nome do item 1")).toHaveValue("Caderno grande");
    fireEvent.click(screen.getByRole("button", { name: "Recarregar a versão mais recente" }));
    expect(refresh).toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("adicionar e remover item; nome hostil permanece texto no campo", () => {
    const { container } = render(<Workbench />);
    fireEvent.click(screen.getByRole("button", { name: "Adicionar item" }));
    expect(screen.getByLabelText("Nome do item 3")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Nome do item 3"), { target: { value: "<img src=x onerror=alert(1)>" } });
    expect(container.querySelector("tbody img")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Remover item 1" }));
    expect(screen.queryByLabelText("Nome do item 3")).toBeNull();
  });
  it("somente leitura: sem campos, sem salvar", () => {
    render(<ReviewItemsEditor submissionId="s1" version={2} initial={initial} thresholds={TH} readOnly action={async () => IDLE} />);
    expect(screen.queryByLabelText("Nome do item 1")).toBeNull();
    expect(screen.queryByRole("button", { name: "Salvar edição" })).toBeNull();
    expect(screen.getByText("Caderno")).toBeInTheDocument();
  });
});

describe("UX-112", () => {
  it("somente leitura: Ano letivo vira texto, sem campo desabilitado", () => {
    render(<ReviewItemsEditor submissionId="s1" version={2} initial={initial} thresholds={TH} readOnly action={async () => IDLE} />);
    expect(document.querySelector('input[type="number"]')).toBeNull();
    expect(screen.getByText("Ano letivo")).toBeInTheDocument();
  });
  it("documento: texto de apoio quando a pré-visualização não carrega", () => {
    const { container } = render(<ReviewDocument submissionId="s1" mimeType="application/pdf" sizeBytes={1000} />);
    expect(container.textContent).toMatch(/Se o documento não aparecer/);
  });
});


describe("tamanho dos componentes", () => {
  it("nenhum arquivo de components/review nem de app/admin/revisao passa de 250 linhas", () => {
    const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
    for (const f of [...walk("components/review"), ...walk("app/admin/revisao")]) {
      expect(readFileSync(f, "utf8").split("\n").length, f).toBeLessThanOrEqual(250);
      expect(readFileSync(f, "utf8"), f).not.toMatch(/dangerouslySetInnerHTML|: any\b|as any\b/);
    }
  });
});
