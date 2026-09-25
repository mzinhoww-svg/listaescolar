export default function Loading() {
  return (
    <main className="mx-auto flex w-full max-w-[420px] flex-col gap-4 px-6 pt-10" aria-busy="true">
      <h1 className="text-[28px] font-extrabold">Notificações</h1>
      <p role="status" className="text-texto-2 text-[14px] font-semibold">Carregando…</p>
    </main>
  );
}
