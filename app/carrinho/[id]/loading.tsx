import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return <Skeleton label="Carregando as opções…" blocks={["h-8 w-2/3", "h-32", "h-32", "h-32"]} />;
}
