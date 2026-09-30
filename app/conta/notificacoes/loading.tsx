import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Carregando da central. Seguro contra soft-404 (D-043): esta rota nunca chama `notFound()`; o guard é do layout
 * (`app/conta/layout.tsx`) e do proxy, que respondem 307/403 antes. Provado por `scripts/e2e-soft-404.sh`.
 */
export default function Loading() {
  return (
    <main className="mx-auto flex w-full max-w-[420px] flex-col gap-4 px-6 pt-6">
      <h1 className="text-[28px] font-extrabold">Notificações</h1>
      <Skeleton label="Carregando as notificações…" blocks={["h-16", "h-16", "h-40"]} className="px-0 py-0" />
    </main>
  );
}
