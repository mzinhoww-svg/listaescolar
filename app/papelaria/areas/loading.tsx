import { SkeletonBlock } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-4">
      <span className="sr-only">Carregando…</span>
      <SkeletonBlock className="h-10 w-64" />
      <SkeletonBlock className="h-40" />
      <SkeletonBlock className="h-64" />
    </div>
  );
}
