import { Skeleton } from "@/components/ui/Skeleton";

/** Carregando padrão (S29, UX-004): rotas sem `loading.tsx` próprio mostram um esqueleto com altura reservada, sem spinner de tela cheia. */
export default function Loading() {
  return <Skeleton blocks={["h-10 w-2/3", "h-40", "h-40", "h-24"]} />;
}
