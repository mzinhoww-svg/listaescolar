// Contrato do LeadListContextReader (S11): memória (demonstração) e banco real.
import { describe, expect, it } from "vitest";
import type { LeadListContext, LeadListContextReader } from "@/features/leads/ports";

export type LeadContextHarness = {
  reader: LeadListContextReader;
  known: { listId: string; actorId?: string; expected: Partial<LeadListContext> };
  /** Só no real: cópia do pai de outro dono e cópia do pai SEM escola (nada inventado). */
  foreign?: { listId: string; otherActorId: string };
  noSchoolCopy?: { listId: string; ownerId: string };
};

const UNKNOWN = "99999999-9999-4999-8999-999999999999";

export function runLeadContextContract(name: string, make: () => LeadContextHarness | Promise<LeadContextHarness>): void {
  describe(`contrato LeadListContextReader: ${name}`, () => {
    it("lista conhecida: escola, série, ano, itens e isDemo (público, sem dado de estudante)", async () => {
      const { reader, known } = await make();
      const c = await reader.getContext(known.listId, { actorId: known.actorId ?? null });
      expect(c).toMatchObject(known.expected);
      expect(Object.keys(c!).sort()).toEqual(expect.arrayContaining(["gradeLabel", "isDemo", "items", "schoolName", "schoolYear"]));
    });

    it("inexistente e id inválido: null", async () => {
      const { reader } = await make();
      expect(await reader.getContext(UNKNOWN)).toBeNull();
      expect(await reader.getContext("x")).toBeNull();
    });

    it("cópia alheia e cópia sem escola: null (nunca inventa escola, série ou ano)", async () => {
      const { reader, foreign, noSchoolCopy } = await make();
      if (foreign) expect(await reader.getContext(foreign.listId, { actorId: foreign.otherActorId })).toBeNull();
      if (noSchoolCopy) expect(await reader.getContext(noSchoolCopy.listId, { actorId: noSchoolCopy.ownerId })).toBeNull();
    });
  });
}
