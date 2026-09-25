// Rótulo da escola para a tela de revisão (S10). ADR-004 proíbe ler a tabela de escolas pela trilha Pipeline: o rótulo vem de uma
// porta. Em memória (só local, com a fixture da S09 + `label`); a implementação real é da S11. Sem porta: "não identificada".
import { parsePublicationFixture } from "../../supabase/functions/_shared/publication/memory";
import { publicationPortsAllowed, type PublicationEnv } from "../../supabase/functions/_shared/publication/composition";

export type SchoolLabel = { name: string; inep: string };

export interface SchoolLabelReader {
  labels(ids: readonly string[]): Promise<Record<string, SchoolLabel>>;
}

export class MemorySchoolLabelReader implements SchoolLabelReader {
  constructor(private readonly byId: ReadonlyMap<string, SchoolLabel>) {}
  async labels(ids: readonly string[]): Promise<Record<string, SchoolLabel>> {
    const out: Record<string, SchoolLabel> = {};
    for (const id of ids) {
      const l = this.byId.get(id);
      if (l) out[id] = l;
    }
    return out;
  }
}

/** `null` = porta não ligada (produção, preview e staging até a S11): a tela mostra "Escola não identificada neste ambiente". */
export function createSchoolLabelReader(env: PublicationEnv): SchoolLabelReader | null {
  if (!publicationPortsAllowed(env)) return null;
  const fixture = parsePublicationFixture(env.FAKE_PUBLICATION_FIXTURE);
  if (!fixture) return null;
  const byId = new Map<string, SchoolLabel>();
  for (const s of fixture.schools) if (s.label) byId.set(s.id, s.label);
  return new MemorySchoolLabelReader(byId);
}

export const SCHOOL_LABEL_UNAVAILABLE = "Escola não identificada neste ambiente";
