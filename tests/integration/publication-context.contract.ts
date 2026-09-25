// Contrato do PublicationContextReader (S11): memória (fixture) e banco real.
import { describe, expect, it } from "vitest";
import type { PublicationContextReader } from "../../supabase/functions/_shared/publication/ports";

export type PublicationContextHarness = {
  reader: PublicationContextReader;
  school: { id: string; verification: string; municipalityEnabled: boolean };
  gradeLabel: string;
  gradeSlug: string;
  schoolYear: number;
  linkedProfile: string;
  unlinkedProfile: string;
  unknownSchoolId: string;
};

export function runPublicationContextContract(name: string, make: () => PublicationContextHarness | Promise<PublicationContextHarness>): void {
  describe(`contrato PublicationContextReader: ${name}`, () => {
    it("escola, verificação, município, série (rótulo -> slug) e vínculo do remetente", async () => {
      const h = await make();
      const linked = await h.reader.load({ schoolId: h.school.id, grade: h.gradeLabel, schoolYear: h.schoolYear, submittedBy: h.linkedProfile });
      expect(linked.school).toEqual({ verification: h.school.verification, municipalityEnabled: h.school.municipalityEnabled });
      expect(linked.gradeSlug).toBe(h.gradeSlug);
      expect(linked.submitterLinked).toBe(true);
      expect(linked.currentList).toBeNull();
      expect((await h.reader.load({ schoolId: h.school.id, grade: h.gradeLabel, schoolYear: h.schoolYear, submittedBy: h.unlinkedProfile })).submitterLinked).toBe(false);
    });

    it("escola desconhecida, série fora do catálogo e entrada nula: nulos, nunca adivinha", async () => {
      const h = await make();
      expect((await h.reader.load({ schoolId: h.unknownSchoolId, grade: h.gradeLabel, schoolYear: h.schoolYear, submittedBy: h.linkedProfile })).school).toBeNull();
      expect((await h.reader.load({ schoolId: h.school.id, grade: "Curso livre de origami", schoolYear: h.schoolYear, submittedBy: h.linkedProfile })).gradeSlug).toBeNull();
      const none = await h.reader.load({ schoolId: null, grade: null, schoolYear: null, submittedBy: h.linkedProfile });
      expect(none).toMatchObject({ school: null, gradeSlug: null, currentList: null });
    });

    it("validSchoolYears: inteiros plausíveis (ano corrente e o seguinte no real)", async () => {
      const h = await make();
      const c = await h.reader.load({ schoolId: null, grade: null, schoolYear: null, submittedBy: h.linkedProfile });
      expect(c.validSchoolYears.length).toBeGreaterThan(0);
      expect(c.validSchoolYears.every((y) => Number.isInteger(y) && y >= 2000 && y <= 2100)).toBe(true);
    });
  });
}
