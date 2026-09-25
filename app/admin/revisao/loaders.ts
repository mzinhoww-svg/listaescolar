import "server-only";

import type { ConfidenceThresholds } from "@/features/review/confidence";
import { buildReviewService, buildSchoolLabelReader } from "@/features/review/deps";
import type { SchoolLabel } from "@/features/review/school-labels";
import { buildPublicationDeps } from "@/features/publication/factory";
import { publicationIsDemo } from "@/features/publication";

/** Limiares de confiança de `ai_settings`. Sem configuração (ou erro): `null` e a tela mostra "faixa indisponível". */
export async function loadThresholds(): Promise<ConfidenceThresholds | null> {
  try {
    const s = await buildPublicationDeps().settings.load();
    return s ? { confidenceThreshold: s.confidenceThreshold, itemConfidenceThreshold: s.itemConfidenceThreshold } : null;
  } catch {
    return null;
  }
}

/** Rótulos das escolas pela porta (memória só local; sem porta = vazio e a tela diz "Escola não identificada neste ambiente"). */
export async function loadSchoolLabels(ids: readonly (string | null)[]): Promise<Record<string, SchoolLabel>> {
  const wanted = [...new Set(ids.filter((x): x is string => x !== null))];
  if (wanted.length === 0) return {};
  try {
    return (await buildSchoolLabelReader()?.labels(wanted)) ?? {};
  } catch {
    return {};
  }
}

export { buildReviewService };

/** Portas de publicação existem neste ambiente? `demo` = a publicação usaria a porta em memória (selo "Demonstração"). */
export function loadPublicationInfo(): { available: boolean; demo: boolean } {
  try {
    const d = buildPublicationDeps();
    const e = process.env;
    return { available: d.publisher !== null && d.context !== null, demo: publicationIsDemo({ NODE_ENV: e.NODE_ENV, APP_ENV: e.APP_ENV, VERCEL_ENV: e.VERCEL_ENV, FAKE_PUBLICATION_FIXTURE: e.FAKE_PUBLICATION_FIXTURE }) };
  } catch {
    return { available: false, demo: false };
  }
}
