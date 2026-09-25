import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { IDLE, state, type ReviewActionState } from "@/app/admin/revisao/state";
import { AlertNote } from "@/components/review/AlertNote";
import { ConfidenceBadge } from "@/components/review/ConfidenceBadge";
import { DecisionPanel } from "@/components/review/DecisionPanel";
import { DraftProvider } from "@/components/review/DraftContext";
import { ReviewItemsEditor, type ReviewDraft } from "@/components/review/ReviewItemsEditor";
import type { ReviewItem } from "@/features/review/schemas";

const item = (o: Partial<ReviewItem> = {}): ReviewItem => ({ name: "Caderno", quantity: 2, unit: null, category: "papelaria", confidence: 0.9, alerts: [], origin: "extracted", ...o });
const initial: ReviewDraft = { grade: "4º ano", schoolYear: 2027, items: [item(), item({ name: "Lápis", quantity: null, confidence: 0.4 })] };
const TH = { confidenceThreshold: 0.8, itemConfidenceThreshold: 0.6 };
type Act = (prev: ReviewActionState, fd: FormData) => Promise<ReviewActionState>;

function Workbench({ save, blockers = [], status = "human_review", actions, canPublish = false, orphaned = false, available = true, demo = false }: { save?: Act; blockers?: never[] | string[] | null; status?: string; canPublish?: boolean; orphaned?: boolean; available?: boolean; demo?: boolean; actions?: Partial<Record<"approveAndPublish" | "reject" | "publish", Act>> }) {
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
        actions={{ approveAndPublish: actions?.approveAndPublish ?? noop, reject: actions?.reject ?? noop, publish: actions?.publish ?? noop }}
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

describe("DecisionPanel", () => {
  it("bloqueios indisponíveis: role=alert e aprovar desabilitado", () => {
    render(<Workbench blockers={null} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível verificar as pendências");
    expect(screen.getByRole("button", { name: "Aprovar e publicar" })).toBeDisabled();
  });
  it("publish_orphaned desabilita aprovar", () => {
    render(<Workbench orphaned />);
    expect(screen.getByRole("button", { name: "Aprovar e publicar" })).toBeDisabled();
  });
  it("sem porta: após aprovar, a re-renderização com status approved mantém o aviso fixo e 'Publicar' desabilitado", async () => {
    const approve = vi.fn<Act>(async () => state("unavailable", "Lista aprovada. Publicação indisponível neste ambiente até a integração."));
    const { rerender } = render(<Workbench available={false} actions={{ approveAndPublish: approve }} />);
    fireEvent.click(screen.getByRole("button", { name: "Aprovar e publicar" }));
    await waitFor(() => expect(approve).toHaveBeenCalled());
    rerender(<Workbench available={false} status="approved" canPublish actions={{ approveAndPublish: approve }} />);
    expect(screen.getAllByText(/Publicação indisponível neste ambiente até a integração/)).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Tentar publicar de novo" })).toBeDisabled();
  });
  it("com porta, 'Publicar' fica habilitado no envio aprovado", () => {
    render(<Workbench status="approved" canPublish />);
    expect(screen.getByRole("button", { name: "Publicar" })).toBeEnabled();
    expect(screen.queryByText(/Publicação indisponível/)).toBeNull();
  });
  it("'Lista publicada.' leva o selo Demonstração com a porta em memória (também após re-renderizar como published)", async () => {
    const approve = vi.fn<Act>(async () => state("published", "Lista publicada."));
    const { rerender } = render(<Workbench demo actions={{ approveAndPublish: approve }} />);
    fireEvent.click(screen.getByRole("button", { name: "Aprovar e publicar" }));
    expect(await screen.findByText("Lista publicada.")).toBeInTheDocument();
    expect(screen.getByText("Demonstração")).toBeInTheDocument();
    rerender(<Workbench demo status="published" actions={{ approveAndPublish: approve }} />);
    expect(screen.getByText("Lista publicada.")).toBeInTheDocument();
    expect(screen.getByText("Demonstração")).toBeInTheDocument();
  });
  it("sem demonstração, sem selo; 'Salve a edição antes de aprovar.' é role=status", () => {
    render(<Workbench actions={{ approveAndPublish: async () => state("published", "Lista publicada.") }} />);
    fireEvent.change(screen.getByLabelText("Nome do item 1"), { target: { value: "x" } });
    expect(screen.getByText("Salve a edição antes de aprovar.")).toHaveAttribute("role", "status");
    expect(screen.queryByText("Demonstração")).toBeNull();
  });

  it("bloqueios em frases desabilitam o botão e mostram o motivo", () => {
    render(<Workbench blockers={["item_quantity_missing", "grade_missing"]} />);
    expect(screen.getByText("Há item sem quantidade: informe um número de 1 a 9999.")).toBeInTheDocument();
    expect(screen.getByText("Informe a série.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aprovar e publicar" })).toBeDisabled();
    expect(screen.queryByLabelText("Conferi o documento original")).toBeNull();
  });
  it("com alerta crítico, a confirmação é obrigatória e é enviada", async () => {
    const approve = vi.fn<Act>(async () => state("published", "Lista publicada."));
    render(<Workbench blockers={["critical_alerts_unconfirmed"]} actions={{ approveAndPublish: approve }} />);
    const btn = screen.getByRole("button", { name: "Aprovar e publicar" });
    expect(btn).toBeDisabled();
    fireEvent.click(screen.getByLabelText("Conferi o documento original"));
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    await waitFor(() => expect(approve).toHaveBeenCalled());
    const fd = approve.mock.calls[0]![1];
    expect(fd.get("acknowledged")).toBe("on");
    expect(fd.get("expectedVersion")).toBe("2");
    expect(await screen.findByRole("status")).toHaveTextContent("Lista publicada.");
  });
  it.each([
    ["pending", "Lista aprovada; publicação em andamento.", "status", "Tentar publicar de novo"],
    ["unavailable", "Publicação indisponível neste ambiente.", "status", "Tentar publicar de novo"],
    ["failed", "A publicação falhou e o envio voltou à fila.", "alert", "Aprovar e publicar"],
  ] as const)("resultado %s", async (kind, message, role, label) => {
    render(<Workbench actions={{ approveAndPublish: async () => state(kind, message) }} />);
    fireEvent.click(screen.getByRole("button", { name: "Aprovar e publicar" }));
    expect(await screen.findByRole(role)).toHaveTextContent(message);
    expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
  });
  it("recusa: motivo de lista fechada obrigatório (select, sem texto livre)", async () => {
    const reject = vi.fn<Act>(async () => state("rejected", "Lista recusada."));
    const { container } = render(<Workbench actions={{ reject }} />);
    const btn = screen.getByRole("button", { name: "Recusar" });
    expect(btn).toBeDisabled();
    expect(container.querySelector("textarea")).toBeNull();
    fireEvent.change(screen.getByLabelText("Motivo da recusa"), { target: { value: "illegible_document" } });
    fireEvent.click(btn);
    await waitFor(() => expect(reject).toHaveBeenCalled());
    expect(reject.mock.calls[0]![1].get("reason")).toBe("illegible_document");
    expect(await screen.findByRole("status")).toHaveTextContent("Lista recusada.");
  });
  it.each(["published", "rejected"])("envio %s: somente leitura, sem decisões", (status) => {
    render(<Workbench status={status} />);
    expect(screen.getByText(/somente leitura/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Aprovar|Recusar/ })).toBeNull();
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
