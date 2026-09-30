import { SkeletonBlock } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div role="status" aria-busy="true" className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-6 py-8">
      <span className="sr-only">Carregando…</span>
      <SkeletonBlock className="h-10 w-64" />
      <SkeletonBlock className="h-64" />
    </div>
  );
}
