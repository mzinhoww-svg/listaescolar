export default function Loading() {
  return (
    <div role="status" aria-busy="true" aria-label="Carregando créditos e plano" className="flex flex-col gap-6">
      <div className="bg-campo h-10 w-64 animate-pulse rounded-campo" />
      <div className="bg-campo h-40 animate-pulse rounded-card" />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="bg-campo h-56 animate-pulse rounded-card" />
        <div className="bg-campo h-56 animate-pulse rounded-card" />
      </div>
      <div className="bg-campo h-64 animate-pulse rounded-card" />
    </div>
  );
}
