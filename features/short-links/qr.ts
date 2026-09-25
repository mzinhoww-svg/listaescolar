import QRCode from "qrcode";

export const QR_MARGIN = 4;
const COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

/** Só a matriz de módulos (a biblioteca não desenha nada); nível de correção M. */
export function qrMatrix(text: string): boolean[][] {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: "M" });
  const rows: boolean[][] = [];
  for (let y = 0; y < modules.size; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < modules.size; x++) row.push(modules.get(y, x) === 1);
    rows.push(row);
  }
  return rows;
}

/** Lado do desenho em módulos, com a margem (zona silenciosa) de 4. */
export function qrSide(matrix: boolean[][]): number {
  return matrix.length + QR_MARGIN * 2;
}

/** Atributo `d` de um único `<path>`: uma faixa por sequência horizontal de módulos escuros. */
export function qrPathData(matrix: boolean[][]): string {
  const parts: string[] = [];
  matrix.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x++;
        continue;
      }
      let end = x;
      while (end < row.length && row[end]) end++;
      parts.push(`M${x + QR_MARGIN} ${y + QR_MARGIN}h${end - x}v1h-${end - x}z`);
      x = end;
    }
  });
  return parts.join("");
}

export function renderQrSvg(matrix: boolean[][], { size, color }: { size: number; color: string }): string {
  if (!COLOR_PATTERN.test(color)) throw new Error("cor inválida");
  if (!Number.isInteger(size) || size < 16 || size > 4096) throw new Error("tamanho inválido");
  const n = qrSide(matrix);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${size}" height="${size}" shape-rendering="crispEdges">` +
    `<rect width="${n}" height="${n}" fill="#FFFFFF"/>` +
    `<path fill="${color}" d="${qrPathData(matrix)}"/></svg>`
  );
}
