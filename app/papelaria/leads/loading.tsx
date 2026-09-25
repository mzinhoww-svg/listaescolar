export default function Loading() {
  return (
    <div role="status" aria-busy="true" aria-label="Carregando leads" className="flex flex-col gap-4">
      <div className="bg-campo h-10 w-64 animate-pulse rounded-campo" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="bg-campo h-24 animate-pulse rounded-card" />
        ))}
      </div>
      <div className="bg-campo h-64 animate-pulse rounded-card" />
    </div>
  );
}
