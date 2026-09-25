/**
 * CNPJ (numérico ou alfanumérico, IN RFB 2.229/2024) a partir de 12 caracteres [0-9A-Z]. Implementação independente
 * do domínio, para fixtures: valor de cada caractere = código ASCII - 48; pesos fixos por posição.
 */
export function makeCnpj(base12: string): string {
  const W1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const W2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const dv = (vals: number[], w: number[]): number => {
    const r = vals.reduce((acc, v, i) => acc + v * (w[i] ?? 0), 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const vals = [...base12].map((ch) => ch.charCodeAt(0) - 48);
  const d1 = dv(vals, W1);
  const d2 = dv([...vals, d1], W2);
  return `${base12}${d1}${d2}`;
}
