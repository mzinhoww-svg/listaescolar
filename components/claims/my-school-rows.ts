import { formatDate } from "@/features/claims/format";
import { STATUS_LABEL } from "@/features/claims/messages";
import { nextStep } from "@/features/claims/next-step";
import type { MyClaimRow, MySchoolRow } from "@/features/claims/queries-mine";

export type SchoolRowView = {
  key: string;
  name: string;
  inep: string;
  demo: boolean;
  chipText: string;
  chipClass: string;
  note: string | null;
  step: { title: string; body: string };
  href: string;
  cta: string;
};

/** Escolas do vínculo e reivindicações em análise/recusadas, já com texto, próximo passo e destino: a tabela e os cartões só desenham. */
export function buildSchoolRows(schools: readonly MySchoolRow[], claims: readonly MyClaimRow[], withList: ReadonlySet<string>): SchoolRowView[] {
  const fromSchools = schools.map((s): SchoolRowView => {
    const step = nextStep("approved", withList.has(s.schoolId));
    return {
      key: s.schoolId,
      name: s.name,
      inep: s.inep,
      demo: s.isDemo,
      chipText: s.verificationStatus === "verified" ? "Verificada" : s.verificationStatus === "suspended" ? "Suspensa" : "Cadastrada",
      chipClass: s.verificationStatus === "verified" ? "bg-verde-certo/20 text-verde-fundo" : s.verificationStatus === "suspended" ? "bg-campo text-texto-2" : "bg-aviso-fundo text-aviso-texto",
      note: null,
      step: { title: step.title, body: step.body },
      href: withList.has(s.schoolId) ? `/escolas/${s.inep}` : "/escola/listas/nova",
      cta: step.cta,
    };
  });
  const fromClaims = claims.map((c): SchoolRowView => {
    const step = nextStep(c.status, false);
    return {
      key: c.id,
      name: c.school.name,
      inep: c.school.inep,
      demo: c.isDemo,
      chipText: STATUS_LABEL[c.status],
      chipClass: c.status === "rejected" ? "bg-erro-fundo text-erro-texto" : "bg-aviso-fundo text-aviso-texto",
      note: c.status === "rejected" && c.decisionReason ? `Motivo: ${c.decisionReason}` : `Enviada em ${formatDate(c.createdAt)}`,
      step: { title: step.title, body: step.body },
      href: `/escolas/${c.school.inep}/reivindicar`,
      cta: step.cta,
    };
  });
  return [...fromSchools, ...fromClaims];
}
