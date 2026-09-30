import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Carregando padrão das árvores privadas sem `loading.tsx` próprio (S29, UX-004): esqueleto com altura reservada, sem spinner
 * de tela cheia. NÃO vai em `app/loading.tsx`: na raiz ele forçaria streaming em toda rota e traria de volta o soft-404 (D-043).
 */
export default function PageLoading() {
  return <Skeleton blocks={["h-10 w-2/3", "h-40", "h-40", "h-24"]} />;
}
