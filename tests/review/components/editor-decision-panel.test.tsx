import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { IDLE, state, type ReviewActionState } from "@/app/admin/revisao/state";
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
  it("órfão pendente: 'Conciliar publicação' chama a ação e mostra o resultado (S11)", async () => {
    const reconcile = vi.fn<Act>(async () => state("reconciled", "Publicação conciliada: a versão publicada foi vinculada e o envio está publicado."));
    render(<Workbench orphaned actions={{ reconcile }} />);
    fireEvent.click(screen.getByRole("button", { name: "Conciliar publicação" }));
    await waitFor(() => expect(reconcile).toHaveBeenCalled());
    expect(await screen.findByText(/Publicação conciliada/)).toHaveAttribute("role", "status");
  });
  it("sem órfão pendente não há botão de conciliar", () => {
    render(<Workbench />);
    expect(screen.queryByRole("button", { name: "Conciliar publicação" })).toBeNull();
  });
  it("sem porta: após aprovar, a re-renderização com status approved mantém o aviso fixo e 'Publicar' desabilitado", async () => {
    const approve = vi.fn<Act>(async () => state("unavailable", "Lista aprovada. Publicação indisponível neste ambiente até a integração."));
    const { rerender } = render(<Workbench available={false} actions={{ approveAndPublish: approve }} />);
    fireEvent.click(screen.getByRole("button", { name: "Aprovar e publicar" }));
    fireEvent.click(screen.getByRole("button", { name: "Sim, aprovar e publicar" }));
    await waitFor(() => expect(approve).toHaveBeenCalled());
    rerender(<Workbench available={false} status="approved" canPublish actions={{ approveAndPublish: approve }} />);
    expect(screen.getAllByText(/Publicação indisponível neste ambiente até a integração/)).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Tentar publicar de novo" })).toBeDisabled();
  });
  it("recusa: 'Lista recusada.' continua visível depois de o envio virar rejected (modo somente leitura)", async () => {
    const reject = vi.fn<Act>(async () => state("rejected", "Lista recusada."));
    const { rerender } = render(<Workbench actions={{ reject }} />);
    fireEvent.change(screen.getByLabelText("Motivo da recusa"), { target: { value: "other" } });
    fireEvent.click(screen.getByRole("button", { name: "Recusar" }));
    fireEvent.click(screen.getByRole("button", { name: "Sim, recusar lista" }));
    expect(await screen.findByText("Lista recusada.")).toBeInTheDocument();
    rerender(<Workbench status="rejected" actions={{ reject }} />);
    expect(screen.getByText("Lista recusada.")).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "Sim, aprovar e publicar" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Sim, aprovar e publicar" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Sim, aprovar e publicar" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Sim, recusar lista" }));
    await waitFor(() => expect(reject).toHaveBeenCalled());
    expect(reject.mock.calls[0]![1].get("reason")).toBe("illegible_document");
    expect(await screen.findByRole("status")).toHaveTextContent("Lista recusada.");
  });
  it("aprovar e recusar pedem confirmação com o efeito escrito; ação só roda ao confirmar; link à lista publicada", async () => {
    const approve = vi.fn<Act>(async () => state("published", "Lista publicada.", "/admin/listas/L1"));
    const { container } = render(<Workbench actions={{ approveAndPublish: approve }} />);
    fireEvent.click(screen.getByRole("button", { name: "Aprovar e publicar" }));
    expect(approve).not.toHaveBeenCalled();
    expect(container.textContent).toMatch(/passa a valer para as famílias/);
    expect(container.textContent).toMatch(/arquive-a depois/);
    fireEvent.click(screen.getByRole("button", { name: "Sim, aprovar e publicar" }));
    await waitFor(() => expect(approve).toHaveBeenCalled());
    expect(await screen.findByRole("link", { name: "Ver a lista publicada" })).toHaveAttribute("href", "/admin/listas/L1");
  });
  it.each(["published", "rejected"])("envio %s: somente leitura, sem decisões", (status) => {
    render(<Workbench status={status} />);
    expect(screen.getByText(/somente leitura/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Aprovar|Recusar/ })).toBeNull();
  });
});
