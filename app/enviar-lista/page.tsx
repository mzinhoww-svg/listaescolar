import { requireAccess } from "@/features/auth/guard";
import { loadSchool } from "@/features/schools/search/load-school";
import { sendListHref, parseSendListPrefill } from "@/features/submissions/href";
import { seriesValueForSlug } from "@/components/submissions/series-options";

import { SubmitForm } from "./SubmitForm";

export const metadata = { title: "Enviar lista · ListaCerta" };
// A action grava o arquivo e roda o pipeline (orçamento de 10 s): precisa de folga sobre o padrão.
export const maxDuration = 30;

/** Ano letivo padrão: a partir de agosto, o próximo. */
function schoolYears(now = new Date()) {
  const y = now.getFullYear();
  return { years: [y, y + 1], defaultYear: now.getMonth() >= 7 ? y + 1 : y };
}

/** `?escola=&serie=&ano=` vêm da página da escola e da série sem lista (UX-012): pré-escolhem, a pessoa ainda pode trocar. */
export default async function Page({ searchParams }: PageProps<"/enviar-lista">) {
  const prefill = parseSendListPrefill(await searchParams);
  await requireAccess(sendListHref(prefill));
  const base = schoolYears();
  const school = prefill.inep ? await loadSchool(prefill.inep).catch(() => null) : null;
  const year = prefill.year !== undefined && base.years.includes(prefill.year) ? prefill.year : base.defaultYear;
  return (
    <SubmitForm
      years={base.years}
      defaultYear={year}
      initialGrade={prefill.gradeSlug ? (seriesValueForSlug(prefill.gradeSlug) ?? "") : ""}
      initialSchool={
        school ? { id: school.id, name: school.name, inep: school.inep, neighborhood: school.neighborhood, municipalityName: school.municipalityName } : null
      }
    />
  );
}
