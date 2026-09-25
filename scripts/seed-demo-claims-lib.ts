/** Parte pura do `pnpm seed:demo-claims` (sem I/O): plano das reivindicações demonstrativas e conferência de estado. */

export const DEMO_CLAIMANT_EMAIL = "parent@listacerta.test";
export const DEMO_ADMIN_EMAIL = "admin@listacerta.test";
export const DEMO_EVIDENCE_FIXTURE = "tests/fixtures/claim-evidence-demo.pdf";

export type DemoClaimPlan = {
  inep: string;
  /** Estado final do plano. O seed NUNCA aprova: `approved` não existe aqui (a aprovação é do E2E). */
  expected: "awaiting_verification" | "rejected";
  claimantName: string;
  claimantRoleTitle: string;
  evidenceNote: string;
  /** Só para `rejected`: motivo gravado pelo admin demo. */
  rejectionReason?: string;
};

/** 99001002: pendente por documentos (com o PDF fictício). 99001003: recusada com motivo (estado 4 do App14b). */
export const DEMO_CLAIM_PLANS: readonly DemoClaimPlan[] = [
  {
    inep: "99001002",
    expected: "awaiting_verification",
    claimantName: "Responsável Demonstração",
    claimantRoleTitle: "Secretário(a) escolar",
    evidenceNote: "Documento fictício de demonstração do vínculo com a escola.",
  },
  {
    inep: "99001003",
    expected: "rejected",
    claimantName: "Responsável Demonstração",
    claimantRoleTitle: "Coordenador(a)",
    evidenceNote: "Pedido fictício para demonstrar a recusa.",
    rejectionReason: "Demonstração: o documento enviado não comprova o vínculo com a escola.",
  },
];

/** O seed nunca roda fora de local/staging: não existe flag para produção. */
export type SeedArgs = { allowProduction: false };

export function parseSeedArgs(argv: string[]): SeedArgs {
  for (const a of argv) throw new Error(`Opção desconhecida: ${a}. Uso: pnpm seed:demo-claims (sem opções)`);
  return { allowProduction: false };
}

export type ExistingClaimState = { status: string; evidenceCount: number; decisionReason: string | null };

/** Reivindicação já existente só conta como "já existia" se o estado bate com o plano; senão falha alto (seed não é atômico). */
export function assertExistingClaimMatches(plan: DemoClaimPlan, actual: ExistingClaimState): void {
  const problems: string[] = [];
  if (actual.status !== plan.expected) problems.push(`status ${actual.status} (esperado ${plan.expected})`);
  if (actual.evidenceCount !== 1) problems.push(`${actual.evidenceCount} arquivos (esperado 1)`);
  if (plan.expected === "rejected" && actual.decisionReason !== plan.rejectionReason) {
    problems.push("motivo da recusa diferente do plano");
  }
  if (problems.length > 0) {
    throw new Error(
      `Reivindicação demo ${plan.inep} existe em estado divergente: ${problems.join("; ")}. Um seed anterior pode ter falhado no meio ou o E2E já decidiu; rode pnpm db:reset (local) e o seed de novo.`,
    );
  }
}

/** A conta escolhida precisa ser de teste (@listacerta.test): o seed nunca cria pedido em nome de usuário real. */
export function assertTestAccount(email: string): void {
  if (!email.endsWith("@listacerta.test")) throw new Error(`Conta ${email} não é de teste (@listacerta.test); recusado.`);
}
