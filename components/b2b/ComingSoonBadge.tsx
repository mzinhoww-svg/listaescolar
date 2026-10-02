// Selo "Em breve" para recursos do design fora desta fatia (widget/webhooks = S25; campanhas/insights/faturamento =
// S26). Controlado por `isB2bFeatureEnabled` (features/b2b/features.ts) — nunca mostrado como pronto sem fonte.

export function ComingSoonBadge() {
  return (
    <span className="bg-campo text-texto-2 inline-flex items-center rounded-botao px-2.5 py-1 text-[12px] font-extrabold tracking-[0.02em] uppercase">
      Em breve
    </span>
  );
}
