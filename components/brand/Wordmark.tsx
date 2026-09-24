import { tokens } from "@/lib/brand/tokens";

type WordmarkProps = { className?: string };

/** Wordmark em texto: caixa baixa, "lista" 500 e "certa" 800, espaçamento -5%. */
export function Wordmark({ className }: WordmarkProps) {
  return (
    <span className={className} style={{ letterSpacing: tokens.wordmark.letterSpacing }}>
      <span style={{ fontWeight: tokens.wordmark.lista }}>lista</span>
      <span style={{ fontWeight: tokens.wordmark.certa }}>certa</span>
    </span>
  );
}
