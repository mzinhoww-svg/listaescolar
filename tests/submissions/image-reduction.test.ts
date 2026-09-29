import { describe, expect, it } from "vitest";

import { QUALITY_STEPS, SIDE_STEPS, TARGET_BYTES, reduceToLimit } from "@/features/submissions/image-reduction";

const blobOf = (n: number) => new Blob([new Uint8Array(n)]);

describe("reduceToLimit", () => {
  it("devolve o primeiro encode que cabe", async () => {
    const calls: Array<[number, number]> = [];
    const r = await reduceToLimit(async (s, q) => {
      calls.push([s, q]);
      return blobOf(q > 0.7 ? TARGET_BYTES + 1 : TARGET_BYTES - 1);
    });
    expect(r).toMatchObject({ ok: true, maxSide: SIDE_STEPS[0], quality: 0.65 });
    expect(calls).toHaveLength(3);
  });
  it("desiste quando nada cabe, sem laço infinito", async () => {
    let n = 0;
    const r = await reduceToLimit(async () => {
      n += 1;
      return blobOf(TARGET_BYTES + 1);
    });
    expect(r).toEqual({ ok: false });
    expect(n).toBe(SIDE_STEPS.length * QUALITY_STEPS.length);
  });
  it("ignora blob vazio (encode falho)", async () => {
    expect(await reduceToLimit(async () => blobOf(0))).toEqual({ ok: false });
  });
  it("encode que lança conta como falha e segue para o próximo passo", async () => {
    let n = 0;
    const r = await reduceToLimit(async () => {
      n += 1;
      if (n === 1) throw new Error("canvas");
      return blobOf(10);
    });
    expect(r).toMatchObject({ ok: true, quality: QUALITY_STEPS[1] });
  });
});
