import type { ConfidenceBand } from "@/features/review/confidence";

const TEXT: Record<ConfidenceBand, string> = {
  alta: "Confiança alta",
  media: "Confiança média",
  baixa: "Confiança baixa",
  conferido: "Conferido pela equipe",
  indisponivel: "Faixa indisponível",
};
const STYLE: Record<ConfidenceBand, string> = {
  alta: "bg-verde-certo/25 text-verde-fundo",
  media: "bg-campo text-tinta",
  baixa: "bg-erro-fundo text-erro-texto",
  conferido: "bg-verde-fundo text-papel",
  indisponivel: "bg-campo text-texto-2",
};

/** A faixa vem SEMPRE dos limiares de ai_settings (nada fixo no código). O texto acompanha a cor: cor nunca é o único sinal. */
export function ConfidenceBadge({ band, confidence }: { band: ConfidenceBand; confidence: number | null }) {
  const pct = confidence !== null && (band === "alta" || band === "media" || band === "baixa") ? ` · ${Math.round(confidence * 100)}%` : "";
  return <span className={`${STYLE[band]} inline-flex rounded-botao px-2.5 py-0.5 text-xs font-extrabold`}>{TEXT[band]}{pct}</span>;
}
