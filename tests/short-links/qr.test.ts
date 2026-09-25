import jsQR from "jsqr";
import { describe, expect, it } from "vitest";

import { qrMatrix, renderQrSvg } from "@/features/short-links/qr";
import { encodeShortCode, shortLinkUrl } from "@/features/short-links/code";

const MODULE_PX = 4;
const MARGIN = 4;

function rasterize(matrix: boolean[][]) {
  const n = matrix.length + MARGIN * 2;
  const side = n * MODULE_PX;
  const data = new Uint8ClampedArray(side * side * 4).fill(255);
  matrix.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (!dark) return;
      for (let dy = 0; dy < MODULE_PX; dy++)
        for (let dx = 0; dx < MODULE_PX; dx++) {
          const i = ((((y + MARGIN) * MODULE_PX + dy) * side) + (x + MARGIN) * MODULE_PX + dx) * 4;
          data[i] = data[i + 1] = data[i + 2] = 0;
        }
    }),
  );
  return { data, side };
}

describe("qrMatrix", () => {
  it("decodifica de volta exatamente a URL do link curto", () => {
    const url = shortLinkUrl(encodeShortCode({ inep: "51000123", gradeSlug: "ef-1" }), "https://listacerta.com.br");
    const matrix = qrMatrix(url);
    expect(matrix.length).toBeGreaterThan(20);
    expect(matrix.every((r) => r.length === matrix.length)).toBe(true);
    const { data, side } = rasterize(matrix);
    expect(jsQR(data, side, side)?.data).toBe(url);
  });
});

describe("renderQrSvg", () => {
  const matrix = qrMatrix("https://listacerta.com.br/l/ABCDEFGH");
  const svg = renderQrSvg(matrix, { size: 240, color: "#0F1B2D" });

  it("um só <path>, viewBox com margem 4 e cor Tinta", () => {
    expect(svg.match(/<path /g)).toHaveLength(1);
    const n = matrix.length + 8;
    expect(svg).toContain(`viewBox="0 0 ${n} ${n}"`);
    expect(svg).toContain('fill="#0F1B2D"');
    expect(svg).toContain('width="240"');
  });

  it("sem script nem manipuladores de evento", () => {
    expect(svg).not.toMatch(/<script/i);
    expect(svg).not.toMatch(/\son\w+=/i);
  });

  it("recusa cor fora do formato #RRGGBB", () => {
    expect(() => renderQrSvg(matrix, { size: 100, color: 'red" onload="x' })).toThrow();
  });
});
