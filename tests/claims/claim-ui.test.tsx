import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { ClaimBlock } from "@/components/schools/ClaimBlock";
import { ClaimFlow } from "@/components/claims/ClaimFlow";
import { ClaimQueueCard } from "@/components/claims/ClaimQueueCard";
import { ClaimStepper } from "@/components/claims/ClaimStepper";
import { ClaimTimeline } from "@/components/claims/ClaimTimeline";
import { CreateClaimForm } from "@/components/claims/CreateClaimForm";
import { DecisionForm } from "@/components/claims/DecisionForm";
import { EvidenceUploader } from "@/components/claims/EvidenceUploader";
import { MethodPicker } from "@/components/claims/MethodPicker";
import { MySchoolsTable } from "@/components/claims/MySchoolsTable";
import { TokenPanel } from "@/components/claims/TokenPanel";
import { ok, failed, type ClaimActionState } from "@/features/claims/form-state";
import type { ClaimStatusView, QueueRow, SchoolClaimContext } from "@/features/claims/types";
import { decisionOptions } from "@/app/admin/reivindicacoes/[id]/page";

const CLAIM_ID = "11111111-1111-4111-8111-111111111111";
const noop = vi.fn(async (): Promise<ClaimActionState> => ok("feito"));
const methods: SchoolClaimContext["methods"] = {
  institutional_email: { available: false, reason: "Envio indisponível no momento." },
  institutional_whatsapp: { available: false, reason: "A escola não tem celular registrado no cadastro do INEP." },
  documents: { available: true },
};

describe("ClaimBlock (App14b)", () => {
  it("estado 1 sem reivindicação própria, também para demo", () => {
    render(<ClaimBlock inep="99001001" status="registered" />);
    expect(screen.getByText("Você trabalha nesta escola?")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reivindicar escola" })).toHaveAttribute("href", "/escolas/99001001/reivindicar");
  });
  it("estado 2 (verified): texto sem botão", () => {
    render(<ClaimBlock inep="99001001" status="verified" />);
    expect(screen.getByText("Esta escola já tem administrador")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("estado 3: em análise com a data real e link para o status", () => {
    render(<ClaimBlock inep="99001001" status="claimed" claim={{ status: "awaiting_verification", createdAt: "2026-09-10T15:00:00Z", decisionReason: null }} />);
    expect(screen.getByText("Reivindicação em análise")).toBeInTheDocument();
    expect(screen.getByText(/Enviada em 10\/09\/2026/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver status" })).toHaveAttribute("href", "/escolas/99001001/reivindicar");
  });
  it("estado 4: motivo real e reivindicar de novo", () => {
    render(<ClaimBlock inep="99001001" status="registered" claim={{ status: "rejected", createdAt: "2026-09-10T15:00:00Z", decisionReason: "Documento ilegível" }} />);
    expect(screen.getByText(/Motivo: Documento ilegível/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reivindicar de novo" })).toHaveAttribute("href", "/escolas/99001001/reivindicar?nova=1");
  });
  it("suspensa não mostra bloco", () => {
    const { container } = render(<ClaimBlock inep="99001001" status="suspended" />);
    expect(container.textContent).toBe("");
  });
});

describe("MethodPicker e CreateClaimForm", () => {
  it("método indisponível vem desabilitado com o motivo; documentos disponível", () => {
    render(<MethodPicker methods={methods} />);
    expect(screen.getByLabelText(/E-mail da escola/)).toBeDisabled();
    expect(screen.getByText(/Indisponível: Envio indisponível no momento\./)).toBeInTheDocument();
    expect(screen.getByText(/Indisponível: A escola não tem celular registrado/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Documentos/)).toBeEnabled();
  });
  it("mostra contador N/500, e-mail da sessão e erros do servidor", async () => {
    const action = vi.fn(async (): Promise<ClaimActionState> => failed("Revise os campos destacados.", { claimantName: "Revise este campo." }));
    render(<CreateClaimForm action={action} inep="99001001" methods={methods} accountEmail="parent@listacerta.test" privacyVersion="claim-v1" />);
    expect(screen.getByText(/Você entra como parent@listacerta.test/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Como você comprova/), { target: { value: "abc" } });
    expect(screen.getByText(/3\/500/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Seu nome"), { target: { value: "Ana" } });
    fireEvent.change(screen.getByLabelText("Seu cargo na escola"), { target: { value: "Diretora" } });
    fireEvent.click(screen.getByLabelText(/Aceito que a ListaCerta/));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await screen.findByText("Revise os campos destacados.")).toBeInTheDocument();
    expect(screen.getByText(/claim-v1/)).toBeInTheDocument();
  });
});

describe("EvidenceUploader", () => {
  const props = { inep: "99001001", claimId: CLAIM_ID, evidenceNote: null, editableNote: false, upload: noop, remove: noop, submit: noop };
  it("avisa sobre dados de alunos, lista arquivos e bloqueia o envio sem arquivo", () => {
    render(<EvidenceUploader {...props} evidence={[]} />);
    expect(screen.getByText("Não envie documentos com dados de alunos.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar para análise" })).toBeDisabled();
    expect(screen.getByText("Adicione ao menos um arquivo.")).toBeInTheDocument();
  });
  it("com arquivo: habilita o envio e oferece remover; no limite de 5 bloqueia novos", () => {
    const evidence = Array.from({ length: 5 }, (_, i) => ({ id: `22222222-2222-4222-8222-22222222222${i}`, originalName: `doc${i}.pdf`, mimeType: "application/pdf", sizeBytes: 2048, createdAt: "2026-09-10T15:00:00Z" }));
    render(<EvidenceUploader {...props} evidence={evidence} />);
    expect(screen.getByText("Arquivos (5/5)")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Remover" })).toHaveLength(5);
    expect(screen.getByRole("button", { name: "Enviar para análise" })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Limite de 5 arquivos/ })).toBeDisabled();
  });
  it("recusa arquivo vazio no navegador sem chamar o servidor", async () => {
    const upload = vi.fn(async (): Promise<ClaimActionState> => ok("x"));
    render(<EvidenceUploader {...props} upload={upload} evidence={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Adicionar arquivo" }));
    expect(await screen.findByText("Escolha um arquivo PDF, PNG ou JPEG.")).toBeInTheDocument();
    expect(upload).not.toHaveBeenCalled();
  });
});

describe("TokenPanel", () => {
  const base = { inep: "99001001", claimId: CLAIM_ID, confirmed: false, request: noop, confirm: noop };
  it("e-mail: primeiro envio e reenvio; nunca mostra endereço", () => {
    const { rerender, container } = render(<TokenPanel {...base} method="institutional_email" issued={false} />);
    expect(screen.getByRole("button", { name: "Enviar link para o e-mail da escola registrado no INEP" })).toBeInTheDocument();
    rerender(<TokenPanel {...base} method="institutional_email" issued />);
    expect(screen.getByRole("button", { name: "Reenviar link" })).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/@/);
  });
  it("WhatsApp: campo de 6 dígitos; confirmado esconde os formulários", () => {
    const { rerender } = render(<TokenPanel {...base} method="institutional_whatsapp" issued />);
    expect(screen.getByLabelText("Código de 6 dígitos")).toHaveAttribute("maxlength", "6");
    rerender(<TokenPanel {...base} method="institutional_whatsapp" issued confirmed />);
    expect(screen.getByText(/Canal confirmado/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Código de 6 dígitos")).toBeNull();
  });
});

const statusView = (over: Partial<ClaimStatusView>): ClaimStatusView => ({
  id: CLAIM_ID, schoolId: "33333333-3333-4333-8333-333333333333", method: "documents", status: "awaiting_verification", claimantName: "Ana", claimantRoleTitle: "Diretora",
  evidenceNote: null, channelConfirmedAt: null, decisionReason: null, decidedAt: null, isDemo: true, createdAt: "2026-09-10T15:00:00Z", events: [], evidence: [], ...over,
});
const actions = { upload: noop, remove: noop, submit: noop, request: noop, confirm: noop };

describe("ClaimFlow / ClaimTimeline / ClaimStepper", () => {
  it("em análise: datas reais, passo aberto, sem prazo inventado", () => {
    const events = [{ fromStatus: null, toStatus: "awaiting_verification" as const, actorKind: "claimant" as const, reason: null, createdAt: "2026-09-10T15:00:00Z" }];
    const { container } = render(<ClaimFlow inep="99001001" claim={statusView({ events })} actions={actions} />);
    expect(screen.getByRole("heading", { name: "Em análise" })).toBeInTheDocument();
    expect(screen.getByText(/10\/09\/2026/)).toBeInTheDocument();
    expect(screen.getByText("Decisão da equipe ListaCerta")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\[prazo\]|em até|dias úteis/);
  });
  it("token_expired oferece novo link; insufficient_evidence mostra motivo e reenvio; rejected e approved têm links", () => {
    const { rerender } = render(<ClaimFlow inep="99001001" claim={statusView({ method: "institutional_email", status: "token_expired" })} actions={actions} />);
    expect(screen.getByRole("button", { name: "Reenviar link" })).toBeInTheDocument();
    rerender(<ClaimFlow inep="99001001" claim={statusView({ status: "insufficient_evidence", decisionReason: "Falta o cargo" })} actions={actions} />);
    expect(screen.getByText("Motivo: Falta o cargo")).toBeInTheDocument();
    expect(screen.getByLabelText(/Nota de evidência/)).toBeInTheDocument();
    rerender(<ClaimFlow inep="99001001" claim={statusView({ status: "rejected", decisionReason: "Sem vínculo" })} actions={actions} />);
    expect(screen.getByRole("link", { name: "Reivindicar de novo" })).toHaveAttribute("href", "/escolas/99001001/reivindicar?nova=1");
    rerender(<ClaimFlow inep="99001001" claim={statusView({ status: "approved" })} actions={actions} />);
    expect(screen.getByRole("link", { name: "Ir para Minhas escolas" })).toHaveAttribute("href", "/escola");
  });
  it("timeline fechada não mostra passo aberto; stepper marca o passo atual", () => {
    const { container } = render(<ClaimTimeline events={[]} status="approved" />);
    expect(container.textContent).not.toMatch(/Decisão da equipe/);
    render(<ClaimStepper steps={["A", "B", "C"]} current={2} />);
    expect(screen.getByRole("listitem", { current: "step" })).toHaveTextContent("B");
  });
});

const row = (over: Partial<QueueRow> = {}): QueueRow => ({
  id: CLAIM_ID, status: "awaiting_verification", method: "documents", claimantName: "Ana", claimantRoleTitle: "Diretora", contactEmail: "parent@listacerta.test",
  channelConfirmedAt: null, submittedAt: "2026-09-10T15:00:00Z", createdAt: "2026-09-10T15:00:00Z", isDemo: true, evidenceCount: 2, evidenceNote: "Sou a diretora.",
  school: { inep: "99001002", name: "Escola Demonstração 2", verificationStatus: "registered" }, ...over,
});

describe("Fila do admin", () => {
  it("cartão: escola, reivindicante, sem admin, N/500, arquivos, selo Demonstração e link", () => {
    render(<ClaimQueueCard row={row()} />);
    expect(screen.getByRole("link", { name: "Escola Demonstração 2" })).toHaveAttribute("href", "/escolas/99001002");
    expect(screen.getByText("Escola sem admin")).toBeInTheDocument();
    expect(screen.getByText("Demonstração")).toBeInTheDocument();
    expect(screen.getByText("2 arquivos")).toBeInTheDocument();
    expect(screen.getByText("15/500")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Abrir e decidir" })).toHaveAttribute("href", `/admin/reivindicacoes/${CLAIM_ID}`);
  });
  it("com admin e canal por token: mostra confirmado ou aguardando", () => {
    const { rerender } = render(<ClaimQueueCard row={row({ method: "institutional_email", channelConfirmedAt: "2026-09-11T12:00:00Z", school: { inep: "1", name: "X", verificationStatus: "verified" } })} />);
    expect(screen.getByText("Escola com admin")).toBeInTheDocument();
    expect(screen.getByText(/Canal confirmado em 11\/09\/2026/)).toBeInTheDocument();
    rerender(<ClaimQueueCard row={row({ method: "institutional_whatsapp" })} />);
    expect(screen.getByText("Aguardando confirmação do canal")).toBeInTheDocument();
  });
  it("aprovar desabilitado com o motivo quando falta evidência ou canal", () => {
    const admin = (over: object) => ({ ...row(), evidence: [], events: [], decisionReason: null, decidedAt: null, school: { id: "s", inep: "1", name: "X", verificationStatus: "registered" }, ...over }) as Parameters<typeof decisionOptions>[0];
    expect(decisionOptions(admin({}))[0]).toMatchObject({ to: "approved", allowed: false, reason: "Falta evidência: nenhum arquivo enviado." });
    expect(decisionOptions(admin({ method: "institutional_email" }))[0]).toMatchObject({ allowed: false, reason: "Falta confirmar o canal da escola." });
    expect(decisionOptions(admin({ evidence: [{ id: "e" }] }))[0]).toMatchObject({ allowed: true });
    expect(decisionOptions(admin({ status: "approved" })).every((o) => !o.allowed)).toBe(true);
  });
  it("DecisionForm: recusar e pedir evidência exigem motivo; aprovar não; desabilitada mostra por quê", () => {
    render(<DecisionForm claimId={CLAIM_ID} action={noop} options={[{ to: "approved", allowed: false, reason: "Falta evidência: nenhum arquivo enviado." }, { to: "insufficient_evidence", allowed: true }, { to: "rejected", allowed: true }]} />);
    expect(screen.getByRole("button", { name: "Aprovar" })).toBeDisabled();
    expect(screen.getByText("Falta evidência: nenhum arquivo enviado.")).toBeInTheDocument();
    const reasons = screen.getAllByLabelText(/Motivo/);
    expect(reasons).toHaveLength(2);
    for (const r of reasons) expect(r).toBeRequired();
  });
  it("envia a decisão e mostra a resposta", async () => {
    const action = vi.fn(async (): Promise<ClaimActionState> => ok("Reivindicação recusada."));
    render(<DecisionForm claimId={CLAIM_ID} action={action} options={[{ to: "rejected", allowed: true }]} />);
    fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: "Sem vínculo comprovado" } });
    fireEvent.click(screen.getByRole("button", { name: "Recusar" }));
    await waitFor(() => expect(screen.getByText("Reivindicação recusada.")).toBeInTheDocument());
  });
});

describe("MySchoolsTable (Escola03)", () => {
  it("vazio", () => {
    render(<MySchoolsTable schools={[]} claims={[]} />);
    expect(screen.getByText("Você ainda não administra nenhuma escola.")).toBeInTheDocument();
  });
  it("escola verificada com link público e reivindicações em análise/recusada com motivo", () => {
    render(
      <MySchoolsTable
        schools={[{ schoolId: "s1", inep: "99001004", name: "Escola Demonstração 4", verificationStatus: "verified", isDemo: true, memberRole: "owner" }]}
        claims={[
          { id: CLAIM_ID, status: "awaiting_verification", decisionReason: null, createdAt: "2026-09-10T15:00:00Z", isDemo: true, school: { inep: "99001002", name: "Escola Demonstração 2" } },
          { id: "44444444-4444-4444-8444-444444444444", status: "rejected", decisionReason: "Sem vínculo", createdAt: "2026-09-10T15:00:00Z", isDemo: true, school: { inep: "99001003", name: "Escola Demonstração 3" } },
        ]}
      />,
    );
    expect(screen.getByText("Verificada")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Abrir página pública" })).toHaveAttribute("href", "/escolas/99001004");
    expect(screen.getByRole("link", { name: "Ver status" })).toHaveAttribute("href", "/escolas/99001002/reivindicar");
    expect(screen.getByText("Motivo: Sem vínculo")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver e reivindicar de novo" })).toBeInTheDocument();
  });
});
