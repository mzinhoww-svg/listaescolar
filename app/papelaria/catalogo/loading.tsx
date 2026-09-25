export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-3">
      <p className="text-texto-2 text-[15px] font-bold">Carregando o catálogo…</p>
      <div className="h-40 animate-pulse rounded-card bg-white" />
    </div>
  );
}
