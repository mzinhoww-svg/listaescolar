import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { ClaimFlow } from "@/components/claims/ClaimFlow";
import { ok, type ClaimActionState } from "@/features/claims/form-state";
import { claimStep } from "@/features/claims/steps";
import type { ClaimStatusView } from "@/features/claims/types";

const noop = vi.fn(async (): Promise<ClaimActionState> => ok("feito"));
const actions = { upload: noop, remove: noop, submit: noop, request: noop, confirm: noop };
const statusView = (over: Partial<ClaimStatusView> = {}): ClaimStatusView => ({
  id: "11111111-1111-4111-8111-111111111111", schoolId: "33333333-3333-4333-8333-333333333333", method: "documents", status: "awaiting_verification", claimantName: "Ana", claimantRoleTitle: "Diretora",
  evidenceNote: null, channelConfirmedAt: null, decisionReason: null, decidedAt: null, isDemo: true, createdAt: "2026-09-10T15:00:00Z", events: [], evidence: [], ...over,
});

describe("ClaimFlow por token: status do canal", () => {
  it("token: canal pendente mostra passo de envio; confirmado mostra a confirmação", () => {
    const email = { method: "institutional_email" as const, status: "awaiting_verification" as const };
    const { rerender } = render(<ClaimFlow inep="99001001" claim={statusView(email)} actions={actions} />);
    expect(screen.getByText("Canal: aguardando confirmação")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reenviar link" })).toBeInTheDocument();
    rerender(<ClaimFlow inep="99001001" claim={statusView({ ...email, channelConfirmedAt: "2026-09-11T10:00:00Z" })} actions={actions} />);
    expect(screen.getByText("Canal: confirmado")).toBeInTheDocument();
    expect(screen.getByText(/Canal confirmado\. A equipe/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reenviar link" })).toBeNull();
  });
  it("documentos não mostram status de canal", () => {
    render(<ClaimFlow inep="99001001" claim={statusView()} actions={actions} />);
    expect(screen.queryByText(/^Canal:/)).toBeNull();
  });
  it("claimStep: token sem canal confirmado fica no passo 2; confirmado, no 3", () => {
    expect(claimStep(null)).toBe(1);
    expect(claimStep(statusView({ method: "institutional_email", status: "awaiting_verification" }))).toBe(2);
    expect(claimStep(statusView({ method: "institutional_email", status: "awaiting_verification", channelConfirmedAt: "2026-09-11T10:00:00Z" }))).toBe(3);
    expect(claimStep(statusView({ status: "awaiting_verification" }))).toBe(3);
    expect(claimStep(statusView({ status: "submitted" }))).toBe(2);
    expect(claimStep(statusView({ method: "institutional_email", status: "rejected" }))).toBe(3);
  });
});
