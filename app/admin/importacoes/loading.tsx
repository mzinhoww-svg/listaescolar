export default function Loading() {
  return (
    <div role="status" aria-label="Carregando importações" className="flex flex-1 items-center justify-center">
      <div className="border-campo border-t-verde-certo size-12 animate-spin rounded-full border-4" />
    </div>
  );
}
