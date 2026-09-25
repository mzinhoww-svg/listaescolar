/** CNPJ válido a partir de 12 dígitos (implementação independente do domínio, para fixtures). */
export function makeCnpj(base12: string): string {
  const calc = (digits: number[]): number => {
    const weights = digits.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = digits.reduce((acc, d, i) => acc + d * (weights[i] ?? 0), 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d = [...base12].map(Number);
  const d1 = calc(d);
  const d2 = calc([...d, d1]);
  return `${base12}${d1}${d2}`;
}
