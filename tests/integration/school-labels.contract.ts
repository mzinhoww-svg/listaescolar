// Contrato do SchoolLabelReader (S11): memória (fixture) e banco real. Só colunas públicas (nome e INEP).
import { describe, expect, it } from "vitest";
import type { SchoolLabelReader } from "@/features/review/school-labels";

export type SchoolLabelsHarness = { reader: SchoolLabelReader; known: { id: string; name: string; inep: string }; unknownId: string };

export function runSchoolLabelsContract(name: string, make: () => SchoolLabelsHarness | Promise<SchoolLabelsHarness>): void {
  describe(`contrato SchoolLabelReader: ${name}`, () => {
    it("id conhecido: só nome e INEP; desconhecido some do resultado", async () => {
      const { reader, known, unknownId } = await make();
      const out = await reader.labels([known.id, unknownId]);
      expect(Object.keys(out)).toEqual([known.id]);
      expect(out[known.id]).toEqual({ name: known.name, inep: known.inep });
    });

    it("entrada vazia devolve vazio; ids repetidos não duplicam", async () => {
      const { reader, known } = await make();
      expect(await reader.labels([])).toEqual({});
      expect(Object.keys(await reader.labels([known.id, known.id]))).toEqual([known.id]);
    });
  });
}
