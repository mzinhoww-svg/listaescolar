// Estado de carregamento do portal (streaming entre navegações), antes de a sessão/parceiro estarem resolvidos.
export default function Loading() {
  return (
    <div className="flex min-h-dvh flex-1 items-center justify-center" role="status" aria-label="Carregando">
      <div className="border-tinta/20 border-t-tinta size-10 animate-spin rounded-full border-4" />
    </div>
  );
}
