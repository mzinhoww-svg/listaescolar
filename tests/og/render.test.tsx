// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { renderOgImage } from "@/lib/og/render";

async function png(res: Response) {
  const buf = new Uint8Array(await res.arrayBuffer());
  return { buf, w: new DataView(buf.buffer).getUint32(16), h: new DataView(buf.buffer).getUint32(20) };
}

describe("renderOgImage", () => {
  it("nome com mais de 100 caracteres rende 1200x630 sem estourar", async () => {
    const res = await renderOgImage({ headline: "Colégio Estadual de Ensino Fundamental e Médio ".repeat(3), detail: "Lista de material escolar" });
    const { buf, w, h } = await png(res);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect([buf[1], buf[2], buf[3]]).toEqual([0x50, 0x4e, 0x47]);
    expect([w, h]).toEqual([1200, 630]);
  });

  it("emoji/CJK não dispara nenhuma requisição de rede", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await renderOgImage({ headline: "Escola 🎒 学校", detail: "Lista" });
    const { w, h } = await png(res);
    expect([w, h]).toEqual([1200, 630]);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
