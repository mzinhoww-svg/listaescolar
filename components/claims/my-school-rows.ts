import { formatDate } from "@/features/claims/format";
import { STATUS_LABEL } from "@/features/claims/messages";
import { nextStep } from "@/features/claims/next-step";
import type { MyClaimRow, MySchoolRow, PublishedListLink } from "@/features/claims/queries-mine";

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
  /** Segunda ação (escola com lista publicada continua podendo enviar outras séries, UX-089). */
  more?: { href: string; label: string };
};

/** Escolas do vínculo e reivindicações em análise/recusadas, já com texto, próximo passo e destino: a tabela e os cartões só desenham. */
export function buildSchoolRows(schools: readonly MySchoolRow[], claims: readonly MyClaimRow[], withList: ReadonlySet<string>, listLinks: ReadonlyMap<string, PublishedListLink> = new Map()): SchoolRowView[] {
  const fromSchools = schools.map((s): SchoolRowView => {
    const hasList = withList.has(s.schoolId);
    const step = nextStep("approved", hasList);
    const sendHref = `/escola/listas/nova?escola=${s.schoolId}`;
    return {
      key: s.schoolId,
      name: s.name,
      inep: s.inep,
      demo: s.isDemo,
      chipText: s.verificationStatus === "verified" ? "Verificada" : s.verificationStatus === "suspended" ? "Suspensa" : "Cadastrada",
      chipClass: s.verificationStatus === "verified" ? "bg-verde-certo/20 text-verde-fundo" : s.verificationStatus === "suspended" ? "bg-campo text-texto-2" : "bg-aviso-fundo text-aviso-texto",
      note: null,
      step: { title: step.title, body: step.body },
      href: hasList ? (listLinks.get(s.schoolId)?.href ?? `/escolas/${s.inep}`) : sendHref,
      cta: step.cta,
      ...(hasList ? { more: { href: sendHref, label: "Enviar outra série" } } : {}),
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
