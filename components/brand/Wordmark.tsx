import type { CSSProperties } from "react";
import { tokens } from "@/lib/brand/tokens";

type WordmarkProps = {
  className?: string;
  style?: CSSProperties;
  "aria-hidden"?: boolean;
};

/** Wordmark em texto: caixa baixa, "lista" 500 e "certa" 800, espaçamento -5%. */
export function Wordmark({ className, style, "aria-hidden": ariaHidden }: WordmarkProps) {
  return (
    <span
      data-wordmark
      aria-hidden={ariaHidden}
      className={className}
      style={{ letterSpacing: tokens.wordmark.letterSpacing, ...style }}
    >
      <span style={{ fontWeight: tokens.wordmark.lista }}>lista</span>
      <span style={{ fontWeight: tokens.wordmark.certa }}>certa</span>
    </span>
  );
}
