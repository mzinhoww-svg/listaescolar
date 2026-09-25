/**
 * Só caracteres comprovadamente presentes no cmap da Plus Jakarta Sans ExtraBold (assets/fonts): ASCII imprimível,
 * Latin-1 (sem o hífen suave U+00AD) e Latin Extended-A (sem U+0149 e U+017F), mais pontuação tipográfica comum.
 * Latin Extended-B tem lacunas na fonte e fica de fora. Glifo ausente faria o next/og buscar fonte na rede:
 * nesses casos devolvemos null e o chamador usa a imagem genérica.
 */
const ALLOWED = /^[ -~\u00a0-\u00ac\u00ae-\u0148\u014a-\u017e\u2013\u2014\u2018\u2019\u201c\u201d\u2022\u2026]*$/;
export const OG_TEXT_MAX = 140;

export function ogText(input: string): string | null {
  const text = input.normalize("NFC").replace(/\s+/g, " ").trim();
  if (text === "" || !ALLOWED.test(text)) return null;
  return text.length > OG_TEXT_MAX ? `${text.slice(0, OG_TEXT_MAX - 1).trimEnd()}…` : text;
}

/** Tamanho da manchete em px conforme o comprimento (a caixa tem 1056 px de largura e até 3 linhas). */
export function headlineFontSize(length: number): number {
  if (length <= 40) return 68;
  if (length <= 80) return 52;
  return 40;
}
