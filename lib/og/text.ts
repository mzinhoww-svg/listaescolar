/**
 * A fonte embutida cobre Latin (incl. estendido) e pontuação comum. Glifos fora disso (emoji, CJK) fariam o
 * next/og baixar fonte/emoji da rede: nesses casos devolvemos null e o chamador usa a imagem genérica.
 */
const ALLOWED = /^[ -~ -ɏ–—‘’“”•…]*$/;
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
