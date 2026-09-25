// Contrato do ListReader do carrinho (S11): roda contra a memória (demonstração) e contra o banco real.
import { describe, expect, it } from "vitest";
import type { ListKind, ListReadOptions, ListReader } from "@/features/cart/ports";

export type ListReaderHarness = {
  reader: ListReader;
  /** Lista conhecida (visível ao `actor` informado, ou pública). */
  known: { listId: string; kind: ListKind; isDemo: boolean; itemNames: string[]; options?: ListReadOptions };
  /** Cópia privada de OUTRO dono (só na implementação real): alheia, sem ator e inexistente têm a mesma resposta. */
  foreign?: { listId: string; ownerOptions: ListReadOptions; otherOptions: ListReadOptions };
};

const UNKNOWN = "99999999-9999-4999-8999-999999999999";

export function runListReaderContract(name: string, make: () => ListReaderHarness | Promise<ListReaderHarness>): void {
  describe(`contrato ListReader: ${name}`, () => {
    it("lista conhecida: itens, origem e isDemo declarados", async () => {
      const { reader, known } = await make();
      const l = await reader.getList(known.listId, known.options);
      expect(l).toMatchObject({ kind: known.kind, isDemo: known.isDemo });
      expect(l!.items.map((i) => i.name)).toEqual(known.itemNames);
      expect(l!.items.every((i) => Number.isInteger(i.quantity) && i.quantity > 0 && i.id.length > 0)).toBe(true);
    });

    it("getItems devolve os mesmos itens de getList; inexistente é null nos dois", async () => {
      const { reader, known } = await make();
      expect(await reader.getItems(known.listId, known.options)).toEqual((await reader.getList(known.listId, known.options))!.items);
      expect(await reader.getList(UNKNOWN, known.options)).toBeNull();
      expect(await reader.getItems(UNKNOWN, known.options)).toBeNull();
      expect(await reader.getList("nao-e-uuid", known.options)).toBeNull();
    });

    it("o resultado é uma cópia: alterá-lo não muda a leitura seguinte", async () => {
      const { reader, known } = await make();
      const a = await reader.getList(known.listId, known.options);
      a!.items[0]!.quantity = 999;
      expect((await reader.getList(known.listId, known.options))!.items[0]!.quantity).not.toBe(999);
    });

    it("cópia alheia, sem ator e inexistente devolvem a MESMA resposta (null)", async function () {
      const { reader, foreign } = await make();
      if (!foreign) return;
      const unknown = await reader.getList(UNKNOWN, foreign.otherOptions);
      expect(await reader.getList(foreign.listId, foreign.otherOptions)).toEqual(unknown);
      expect(await reader.getList(foreign.listId, {})).toEqual(unknown);
      expect(unknown).toBeNull();
      expect(await reader.getList(foreign.listId, foreign.ownerOptions)).not.toBeNull();
    });
  });
}
