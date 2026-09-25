/** Streaming da busca: esqueleto neutro (sem números nem nomes). */
export default function Loading() {
  return (
    <main
      role="status"
      aria-label="Carregando resultados"
      className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-col gap-4 px-6 pt-14 pb-9"
    >
      <div className="bg-campo h-12 w-full animate-pulse rounded-full" />
      <div className="bg-campo h-[52px] w-full animate-pulse rounded-full" />
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="h-[80px] w-full animate-pulse rounded-[22px] bg-white" />
      ))}
    </main>
  );
}
