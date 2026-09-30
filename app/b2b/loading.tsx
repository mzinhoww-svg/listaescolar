import { Skeleton } from "@/components/ui/Skeleton";

// Carregando do portal (streaming entre navegações), dentro da casca. A árvore `/b2b` não tem not-found nem rota
// dinâmica (o guard vive no layout, acima deste arquivo), então o loading não vira soft-404 (D-043; provado em
// `scripts/e2e-soft-404.sh`). Se uma página que devolve 404 entrar aqui, mova este arquivo para um grupo de rota.
export default function Loading() {
  return <Skeleton blocks={["h-10 w-2/3", "h-32", "h-40"]} />;
}
