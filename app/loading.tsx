/**
 * Estado de carregamento GLOBAL (S18, D-057/estados e a11y): raiz do App Router — cobre por herança toda rota que
 * não tem o próprio `loading.tsx` (Next.js aninha os limites de Suspense; a rota mais próxima ganha). Antes desta
 * fatia só 6 das 81 rotas tinham loading próprio; as demais navegavam sem nenhum indicador visual durante a busca
 * de dados no servidor. `role="status"`/`aria-live="polite"` para leitor de tela; animação desligada com
 * `prefers-reduced-motion` (o texto "Carregando…" já comunica o estado sem depender do giro).
 */
export default function Loading() {
  return (
    <div className="flex min-h-dvh flex-1 flex-col items-center justify-center gap-3" role="status" aria-live="polite">
      <div className="border-tinta/15 border-t-tinta size-10 animate-spin rounded-full border-4 motion-reduce:animate-none" aria-hidden="true" />
      <p className="text-texto-3 text-[13px] font-semibold">Carregando…</p>
    </div>
  );
}
